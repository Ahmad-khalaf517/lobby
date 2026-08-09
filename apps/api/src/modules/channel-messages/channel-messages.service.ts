import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ChannelMessage, ChannelMessagePreview, ChannelMessageReaction } from '@lobby/shared';
import type { UserProfile } from '@lobby/shared';
import { ChannelService } from '../channels/channel.service';
import { ServerMembersService } from '../server-members/server-members.service';
import { UsersService } from '../users/users.service';
import type { ChannelMessageRow } from './channel-message.mappers';
import { toChannelMessage } from './channel-message.mappers';
import { ChannelMessagesRepository } from './channel-messages.repository';

@Injectable()
export class ChannelMessagesService {
  constructor(
    private readonly repo: ChannelMessagesRepository,
    private readonly users: UsersService,
    private readonly serverMembers: ServerMembersService,
    private readonly channels: ChannelService,
  ) {}

  async listMessages(
    serverId: string,
    channelId: string,
    viewerUserId: string,
    limit: number,
    before?: string,
  ): Promise<ChannelMessage[]> {
    await this.assertAccess(serverId, channelId, viewerUserId);
    const rows = await this.repo.listMessages(channelId, limit, before);
    // Oldest → newest, matching DM history.
    return this.hydrate(rows.reverse(), viewerUserId);
  }

  async searchMessages(
    serverId: string,
    channelId: string,
    viewerUserId: string,
    query: string,
    limit: number,
  ): Promise<ChannelMessage[]> {
    await this.assertAccess(serverId, channelId, viewerUserId);

    // Strip characters with special meaning in PostgREST's filter syntax
    // (`,` separates or() conditions, `()` group them) and ILIKE wildcards
    // (`%`, `_`) so user input can't restructure the query we send.
    const sanitized = (query ?? '').replace(/[,()%_]/g, '');
    if (!sanitized) return [];

    const rows = await this.repo.searchMessages(channelId, sanitized, limit);
    return this.hydrate(rows.reverse(), viewerUserId);
  }

  async sendMessage(
    serverId: string,
    channelId: string,
    senderUserId: string,
    content: string,
    replyToMessageId: string | null,
  ): Promise<ChannelMessage> {
    await this.assertAccess(serverId, channelId, senderUserId);

    // Sending a message first provisions a channel_members row — `messages.sender_id`
    // references channel_members.id, not users.id.
    const member = await this.repo.ensureChannelMember(channelId, senderUserId);

    if (replyToMessageId) {
      // Replying must target a live message in the same channel.
      await this.requireMessageInChannel(channelId, replyToMessageId);
    }

    const row = await this.repo.insertMessage(channelId, member.id, content, replyToMessageId);
    const [message] = await this.hydrate([row], senderUserId);
    return message;
  }

  /** Only the sender can edit their own message. */
  async editMessage(
    serverId: string,
    channelId: string,
    currentUserId: string,
    messageId: string,
    content: string,
  ): Promise<ChannelMessage> {
    await this.assertAccess(serverId, channelId, currentUserId);
    const message = await this.requireMessageInChannel(channelId, messageId);
    await this.requireSender(channelId, currentUserId, message);

    const updated = await this.repo.updateMessageContent(messageId, content);
    const [messageResult] = await this.hydrate([updated], currentUserId);
    return messageResult;
  }

  /** Only the sender can delete their own message (soft delete). */
  async deleteMessage(
    serverId: string,
    channelId: string,
    currentUserId: string,
    messageId: string,
  ): Promise<void> {
    await this.assertAccess(serverId, channelId, currentUserId);
    const message = await this.requireMessageInChannel(channelId, messageId);
    await this.requireSender(channelId, currentUserId, message);

    await this.repo.softDeleteMessage(messageId);
  }

  /** Any channel member can add a reaction (idempotent — re-reacting is a no-op). */
  async addReaction(
    serverId: string,
    channelId: string,
    currentUserId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChannelMessage> {
    await this.assertAccess(serverId, channelId, currentUserId);
    const message = await this.requireMessageInChannel(channelId, messageId);

    const member = await this.repo.ensureChannelMember(channelId, currentUserId);
    await this.repo.addReaction(messageId, member.id, emoji);

    const [result] = await this.hydrate([message], currentUserId);
    return result;
  }

  async removeReaction(
    serverId: string,
    channelId: string,
    currentUserId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChannelMessage> {
    if (!emoji) {
      throw new BadRequestException('emoji is required');
    }
    await this.assertAccess(serverId, channelId, currentUserId);
    const message = await this.requireMessageInChannel(channelId, messageId);

    const member = await this.repo.findChannelMember(channelId, currentUserId);
    if (member) {
      await this.repo.removeReaction(messageId, member.id, emoji);
    }

    const [result] = await this.hydrate([message], currentUserId);
    return result;
  }

  // ---------------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------------

  private async assertAccess(serverId: string, channelId: string, userId: string): Promise<void> {
    if (!(await this.serverMembers.isMember(serverId, userId))) {
      throw new ForbiddenException('You are not a member of this server.');
    }
    // Scoped lookup guarantees the channel actually belongs to this server.
    await this.channels.findChannelInServer(serverId, channelId);
  }

  private async requireMessageInChannel(
    channelId: string,
    messageId: string,
  ): Promise<ChannelMessageRow> {
    const message = await this.repo.findMessageById(messageId);
    if (!message || message.channel_id !== channelId || message.deleted_at) {
      throw new NotFoundException('Message not found.');
    }
    return message;
  }

  private async requireSender(
    channelId: string,
    userId: string,
    message: ChannelMessageRow,
  ): Promise<void> {
    const member = await this.repo.findChannelMember(channelId, userId);
    if (!member || member.id !== message.sender_id) {
      throw new ForbiddenException('You can only modify your own messages.');
    }
  }

  // ---------------------------------------------------------------------
  // Hydration: messages.sender_id (channel_members) → user → profile, plus
  // reply previews and per-emoji reaction summaries for the viewer.
  // ---------------------------------------------------------------------

  private async hydrate(
    rows: ChannelMessageRow[],
    viewerUserId: string,
  ): Promise<ChannelMessage[]> {
    if (rows.length === 0) return [];

    const replyMessageIds = rows.filter((row) => row.reply_to).map((row) => row.reply_to!);

    const [replyMessages, reactions] = await Promise.all([
      replyMessageIds.length > 0
        ? this.repo.findMessagesByIds(replyMessageIds)
        : Promise.resolve([]),
      this.repo.listReactionsForMessages(rows.map((row) => row.id)),
    ]);

    // Authors + reply authors + reactors all resolve through channel_members.
    const allMemberIds = [
      ...new Set([
        ...rows.map((row) => row.sender_id),
        ...replyMessages.map((row) => row.sender_id),
        ...reactions.map((row) => row.channel_member_id),
      ]),
    ];
    const members = await this.repo.listChannelMembersByIds(allMemberIds);
    const memberById = new Map(members.map((member) => [member.id, member]));

    const users = await this.users.findUsersByIds([...new Set(members.map((m) => m.user_id))]);
    const profileByUserId = new Map(users.map((user) => [user.userId, user]));

    const profileForMember = (memberId: string): UserProfile => {
      const member = memberById.get(memberId);
      const profile = member ? profileByUserId.get(member.user_id) : undefined;
      if (!profile) {
        // Can't happen while the FK cascades on user delete; guards a corrupted row.
        throw new NotFoundException(`User for member ${memberId} not found`);
      }
      return profile;
    };

    const replyById = new Map<string, ChannelMessagePreview>();
    for (const row of replyMessages) {
      replyById.set(row.id, {
        id: row.id,
        content: row.content,
        author: profileForMember(row.sender_id),
      });
    }

    const reactionsByMessage = this.groupReactions(reactions, memberById, viewerUserId);

    return rows.map((row) =>
      toChannelMessage(
        row,
        profileForMember(row.sender_id),
        row.reply_to ? (replyById.get(row.reply_to) ?? null) : null,
        reactionsByMessage.get(row.id) ?? [],
      ),
    );
  }

  private groupReactions(
    rows: Awaited<ReturnType<ChannelMessagesRepository['listReactionsForMessages']>>,
    memberById: Map<string, { id: string; user_id: string }>,
    viewerUserId: string,
  ): Map<string, ChannelMessageReaction[]> {
    const grouped = new Map<string, ChannelMessageReaction[]>();
    for (const row of rows) {
      const list = grouped.get(row.message_id) ?? [];
      const existing = list.find((reaction) => reaction.emoji === row.emoji);
      if (existing) {
        existing.count += 1;
        if (memberById.get(row.channel_member_id)?.user_id === viewerUserId) {
          existing.reactedByMe = true;
        }
      } else {
        list.push({
          emoji: row.emoji,
          count: 1,
          reactedByMe: memberById.get(row.channel_member_id)?.user_id === viewerUserId,
        });
      }
      grouped.set(row.message_id, list);
    }
    return grouped;
  }
}

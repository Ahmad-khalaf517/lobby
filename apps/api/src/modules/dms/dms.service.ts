import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DmConversation, DmMessage } from '@lobby/shared';
import { FriendshipsService } from '../friendships/friendships.service';
import { UsersService } from '../users/users.service';
import type { DmConversationRow } from './dms.mappers';
import { toDmMessage } from './dms.mappers';
import { DmsRepository } from './dms.repository';

@Injectable()
export class DmsService {
  constructor(
    private readonly repo: DmsRepository,
    private readonly users: UsersService,
    private readonly friendships: FriendshipsService,
  ) {}

  /** Idempotent get-or-create: DMing someone reuses the existing conversation. */
  async getOrCreateConversation(
    currentUserId: string,
    otherUserId: string,
  ): Promise<DmConversation> {
    if (currentUserId === otherUserId) {
      throw new BadRequestException('You cannot start a conversation with yourself.');
    }

    const [userAId, userBId] = [currentUserId, otherUserId].sort();
    let row = await this.repo.findConversation(userAId, userBId);
    if (!row) {
      // Only gate *starting* a new conversation — reopening an existing one
      // must keep working after a block, same as sendMessage keeps history
      // readable. New messages are still blocked live, in sendMessage.
      if (await this.friendships.isBlockedEitherWay(currentUserId, otherUserId)) {
        throw new ForbiddenException('Unable to start a conversation with this user.');
      }
      row = await this.repo.createConversation(userAId, userBId);
    }

    return this.toConversation(row, currentUserId);
  }

  async listConversations(currentUserId: string): Promise<DmConversation[]> {
    const rows = await this.repo.listConversationsForUser(currentUserId);
    if (rows.length === 0) return [];

    const otherUserIds = [...new Set(rows.map((row) => this.otherUserId(row, currentUserId)))];

    const [usersById, lastMessages] = await Promise.all([
      this.users
        .findUsersByIds(otherUserIds)
        .then((users) => new Map(users.map((user) => [user.userId, user]))),
      this.repo.getLastMessages(rows.map((row) => row.id)),
    ]);

    return Promise.all(
      rows.map(async (row) => {
        const otherUserId = this.otherUserId(row, currentUserId);
        const user = usersById.get(otherUserId);
        if (!user) {
          // Can't happen while the FK cascades on user delete; guards a corrupted row.
          throw new NotFoundException(`User ${otherUserId} not found`);
        }

        const lastMessage = lastMessages.get(row.id);
        const areFriends = await this.friendships.areFriends(currentUserId, otherUserId);

        return {
          conversationId: row.id,
          user,
          areFriends,
          lastMessage: lastMessage ? toDmMessage(lastMessage) : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    );
  }

  async listMessages(
    currentUserId: string,
    conversationId: string,
    limit = 50,
  ): Promise<DmMessage[]> {
    const row = await this.requireParticipant(currentUserId, conversationId);
    const messages = await this.repo.listMessages(row.id, limit);

    // Oldest → newest, matching channel message history.
    return messages.reverse().map(toDmMessage);
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    body: string,
  ): Promise<DmMessage> {
    const row = await this.requireParticipant(currentUserId, conversationId);
    const otherUserId = this.otherUserId(row, currentUserId);

    // Blocks are checked live on every send — blocking mid-conversation stops
    // new messages even though existing history stays readable.
    if (await this.friendships.isBlockedEitherWay(currentUserId, otherUserId)) {
      throw new ForbiddenException('You cannot message this user.');
    }

    const created = await this.repo.insertMessage(row.id, currentUserId, body);
    return toDmMessage(created);
  }

  /** Sets or clears (emoji === null) the reaction on a message in this conversation. */
  async setReaction(
    currentUserId: string,
    conversationId: string,
    messageId: string,
    emoji: string | null,
  ): Promise<DmMessage> {
    const conversation = await this.requireParticipant(currentUserId, conversationId);

    const message = await this.repo.findMessageById(messageId);
    if (!message || message.conversation_id !== conversation.id) {
      throw new NotFoundException('Message not found.');
    }

    const updated = await this.repo.setReaction(messageId, emoji);
    return toDmMessage(updated);
  }

  /** Delete a conversation and its history — the caller must be a participant. */
  async deleteConversation(currentUserId: string, conversationId: string): Promise<void> {
    const row = await this.requireParticipant(currentUserId, conversationId);
    await this.repo.deleteConversation(row.id);
  }

  /** Clear a conversation's message history but keep the conversation row. */
  async clearMessages(currentUserId: string, conversationId: string): Promise<void> {
    const row = await this.requireParticipant(currentUserId, conversationId);
    await this.repo.clearMessages(row.id);
  }

  private async requireParticipant(
    currentUserId: string,
    conversationId: string,
  ): Promise<DmConversationRow> {
    const row = await this.repo.findConversationById(conversationId);
    if (!row) throw new NotFoundException('Conversation not found.');
    if (row.user_a_id !== currentUserId && row.user_b_id !== currentUserId) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }
    return row;
  }

  private async toConversation(
    row: DmConversationRow,
    currentUserId: string,
  ): Promise<DmConversation> {
    const otherUserId = this.otherUserId(row, currentUserId);

    const [user, areFriends, lastMessage] = await Promise.all([
      this.users.getProfile(otherUserId),
      this.friendships.areFriends(currentUserId, otherUserId),
      this.repo.getLastMessages([row.id]).then((map) => map.get(row.id) ?? null),
    ]);

    return {
      conversationId: row.id,
      user,
      areFriends,
      lastMessage: lastMessage ? toDmMessage(lastMessage) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private otherUserId(row: DmConversationRow, viewerId: string): string {
    return row.user_a_id === viewerId ? row.user_b_id : row.user_a_id;
  }
}

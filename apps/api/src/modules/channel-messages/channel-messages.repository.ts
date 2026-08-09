import { Injectable } from '@nestjs/common';
import type { Database } from '../../database/database.types';
import { SupabaseService } from '../database/supabase.service';
import type {
  ChannelMemberRow,
  ChannelMessageReactionRow,
  ChannelMessageRow,
} from './channel-message.mappers';

type MessageInsert = Database['public']['Tables']['messages']['Insert'];

@Injectable()
export class ChannelMessagesRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async findChannelMember(channelId: string, userId: string): Promise<ChannelMemberRow | null> {
    const { data, error } = await this.db
      .from('channel_members')
      .select()
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Get-or-create a channel membership. Sending a message or reacting first
   * joins the channel as a plain `member` — there's no explicit "join channel"
   * flow yet, so membership is provisioned lazily.
   */
  async ensureChannelMember(channelId: string, userId: string): Promise<ChannelMemberRow> {
    const existing = await this.findChannelMember(channelId, userId);
    if (existing) return existing;

    const { data, error } = await this.db
      .from('channel_members')
      .insert({
        channel_id: channelId,
        user_id: userId,
        role: 'member',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Two requests racing the same (channel_id, user_id) — the loser just
    // re-reads the row the winner inserted (relies on the unique index).
    if (error && error.code === '23505') {
      const reRead = await this.findChannelMember(channelId, userId);
      if (reRead) return reRead;
    }
    if (error) throw error;
    return data;
  }

  async listChannelMembersByIds(ids: string[]): Promise<ChannelMemberRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from('channel_members').select().in('id', ids);
    if (error) throw error;
    return data ?? [];
  }

  async insertMessage(
    channelId: string,
    senderMemberId: string,
    content: string,
    replyToMessageId: string | null,
  ): Promise<ChannelMessageRow> {
    const insert: MessageInsert = {
      channel_id: channelId,
      sender_id: senderMemberId,
      content,
    };
    if (replyToMessageId) insert.reply_to = replyToMessageId;

    const { data, error } = await this.db.from('messages').insert(insert).select().single();

    if (error) throw error;
    return data;
  }

  async findMessageById(messageId: string): Promise<ChannelMessageRow | null> {
    const { data, error } = await this.db
      .from('messages')
      .select()
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findMessagesByIds(ids: string[]): Promise<ChannelMessageRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from('messages').select().in('id', ids);
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Newest-first capped at `limit`, optionally before a cursor (created_at).
   * Deleted messages are filtered out. Callers reverse for oldest→newest.
   */
  async listMessages(
    channelId: string,
    limit: number,
    before?: string,
  ): Promise<ChannelMessageRow[]> {
    let query = this.db
      .from('messages')
      .select()
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query.limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  /** Case-insensitive search across non-deleted messages in a channel. */
  async searchMessages(
    channelId: string,
    query: string,
    limit: number,
  ): Promise<ChannelMessageRow[]> {
    const { data, error } = await this.db
      .from('messages')
      .select()
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .or(`content.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  async updateMessageContent(messageId: string, content: string): Promise<ChannelMessageRow> {
    const { data, error } = await this.db
      .from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /** Soft-delete keeps the row so replies (reply_to → messages) don't cascade away. */
  async softDeleteMessage(messageId: string): Promise<void> {
    const { error } = await this.db
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) throw error;
  }

  async listReactionsForMessages(messageIds: string[]): Promise<ChannelMessageReactionRow[]> {
    if (messageIds.length === 0) return [];
    const { data, error } = await this.db
      .from('message_reactions')
      .select()
      .in('message_id', messageIds);
    if (error) throw error;
    return data ?? [];
  }

  /** Idempotent add — re-reacting the same emoji is a no-op (unique index). */
  async addReaction(messageId: string, channelMemberId: string, emoji: string): Promise<void> {
    const { error } = await this.db
      .from('message_reactions')
      .insert({ message_id: messageId, channel_member_id: channelMemberId, emoji });

    if (error && error.code !== '23505') throw error;
  }

  async removeReaction(messageId: string, channelMemberId: string, emoji: string): Promise<void> {
    const { error } = await this.db
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('channel_member_id', channelMemberId)
      .eq('emoji', emoji);

    if (error) throw error;
  }
}

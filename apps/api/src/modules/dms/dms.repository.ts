import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import type { DmConversationRow, DmMessageRow } from './dms.mappers';

@Injectable()
export class DmsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Conversations are stored normalized — user_a_id is always the lexicographically smaller id. */
  async findConversation(userAId: string, userBId: string): Promise<DmConversationRow | null> {
    const { data, error } = await this.db
      .from('dm_conversations')
      .select()
      .eq('user_a_id', userAId)
      .eq('user_b_id', userBId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createConversation(userAId: string, userBId: string): Promise<DmConversationRow> {
    const { data, error } = await this.db
      .from('dm_conversations')
      .insert({ user_a_id: userAId, user_b_id: userBId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async findConversationById(conversationId: string): Promise<DmConversationRow | null> {
    const { data, error } = await this.db
      .from('dm_conversations')
      .select()
      .eq('id', conversationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /** All conversations involving this user, most recently active first. */
  async listConversationsForUser(userId: string): Promise<DmConversationRow[]> {
    const { data, error } = await this.db
      .from('dm_conversations')
      .select()
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async insertMessage(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<DmMessageRow> {
    const { data, error } = await this.db
      .from('dm_messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, content: body })
      .select()
      .single();

    if (error) throw error;

    // Bump the conversation's updated_at so it rises to the top of DM lists.
    const { error: bumpError } = await this.db
      .from('dm_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (bumpError) throw bumpError;
    return data;
  }

  /** Newest-first capped at `limit` — callers reverse for oldest→newest display. */
  async listMessages(conversationId: string, limit = 50): Promise<DmMessageRow[]> {
    const { data, error } = await this.db
      .from('dm_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  async findMessageById(messageId: string): Promise<DmMessageRow | null> {
    const { data, error } = await this.db
      .from('dm_messages')
      .select()
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /** Sets the message's single reaction slot; pass null to clear it. */
  async setReaction(messageId: string, emoji: string | null): Promise<DmMessageRow> {
    const { data, error } = await this.db
      .from('dm_messages')
      .update({ reaction_emoji: emoji })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /** Most recent message per conversation, for list previews. */
  async getLastMessages(conversationIds: string[]): Promise<Map<string, DmMessageRow>> {
    const lastByConversation = new Map<string, DmMessageRow>();

    for (const conversationId of conversationIds) {
      const { data, error } = await this.db
        .from('dm_messages')
        .select()
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) lastByConversation.set(conversationId, data);
    }

    return lastByConversation;
  }
}

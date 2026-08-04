import { Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import type { Channel, Message } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toChannel, toChannels, toMessage, toMessages } from './channels.mappers';

@Injectable()
export class ChannelsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private messageSelect(includeReactions: boolean): string {
    return includeReactions
      ? '*, channel_members(guest_name, user_id), message_reactions(emoji, channel_members(guest_name, user_id))'
      : '*, channel_members(guest_name, user_id)';
  }

  /** Open (non-expired) channels, newest first — powers the guest browse/join page. */
  async listChannels(limit = 50): Promise<Channel[]> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .select()
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return toChannels(data ?? []);
  }

  async createChannel(name: string, ttlHours = 24): Promise<Channel> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .insert({
        id: nanoid(8),
        name,
        expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return toChannel(data);
  }

  async findChannel(id: string): Promise<Channel> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .select()
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Channel not found or expired');
    return toChannel(data);
  }

  /**
   * Opens a channel membership for a guest joining over the socket. Rows are
   * never deleted (see ChannelMemberRow) — `closeChannelMember` below closes
   * one via `left_at` instead, so past messages still resolve an author
   * afterward. The live schema enforces a unique (channel_id, lower(guest_name))
   * constraint, so a guest rejoining under the same name (refresh, reconnect,
   * or simply two people picking the same display name) must reactivate that
   * existing row rather than insert a duplicate — hence look-up-then-write
   * instead of a plain insert.
   *
   * `livekit_identity` is required by the live schema even though no call
   * flow reads it yet — reserved for BE-2's future call-token endpoint.
   */
  async openChannelMember(channelId: string, guestName: string): Promise<{ id: string }> {
    // Escape ILIKE wildcards so a display name containing `%`/`_` can't
    // match a different guest's row.
    const escapedName = guestName.replace(/[%_\\]/g, (char) => `\\${char}`);

    const { data: existing, error: findError } = await this.supabase.client
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .ilike('guest_name', escapedName)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { data, error } = await this.supabase.client
        .from('channel_members')
        .update({ left_at: null, livekit_identity: nanoid() })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) throw error;
      return data;
    }

    const { data, error } = await this.supabase.client
      .from('channel_members')
      .insert({ channel_id: channelId, guest_name: guestName, livekit_identity: nanoid() })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  async closeChannelMember(memberId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('channel_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', memberId);

    if (error) throw error;
  }

  async addMessage(channelId: string, senderId: string, text: string): Promise<Message> {
    const baseQuery = this.supabase.client
      .from('messages')
      .insert({ channel_id: channelId, sender_id: senderId, content: text });

    const { data: withReactions, error: reactionError } = await baseQuery
      .select(this.messageSelect(true))
      .single();

    if (!reactionError && withReactions) {
      return toMessage(withReactions as never);
    }

    const { data, error } = await this.supabase.client
      .from('messages')
      .select(this.messageSelect(false))
      .eq('channel_id', channelId)
      .eq('sender_id', senderId)
      .eq('content', text)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return toMessage(data as never);
  }

  async getMessages(channelId: string, limit = 100): Promise<Message[]> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .select(this.messageSelect(true))
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!error) {
      return toMessages((data ?? []) as never);
    }

    const fallback = await this.supabase.client
      .from('messages')
      .select(this.messageSelect(false))
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fallback.error) throw fallback.error;
    return toMessages((fallback.data ?? []) as never);
  }

  async upsertMessageReaction(
    channelId: string,
    messageId: string,
    channelMemberId: string,
    emoji: string,
  ): Promise<{ removed: boolean }> {
    const { data: message, error: messageLookupError } = await this.supabase.client
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('channel_id', channelId)
      .maybeSingle();

    if (messageLookupError) throw messageLookupError;
    if (!message) {
      throw new NotFoundException('Message not found in this channel');
    }

    // Toggle semantics: a member re-sending the same emoji removes their
    // reaction instead of no-oping, so clicking an existing reaction chip
    // only clears that member's own reaction.
    const { data: existing, error: existingError } = await this.supabase.client
      .from('message_reactions')
      .select('emoji')
      .eq('message_id', messageId)
      .eq('channel_member_id', channelMemberId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing && existing.emoji === emoji) {
      const { error } = await this.supabase.client
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('channel_member_id', channelMemberId);

      if (error) throw error;
      return { removed: true };
    }

    const { error } = await this.supabase.client.from('message_reactions').upsert(
      {
        message_id: messageId,
        channel_member_id: channelMemberId,
        emoji,
      },
      {
        onConflict: 'message_id,channel_member_id',
      },
    );

    if (error) throw error;
    return { removed: false };
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const { data: message, error: messageLookupError } = await this.supabase.client
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('channel_id', channelId)
      .maybeSingle();

    if (messageLookupError) throw messageLookupError;
    if (!message) {
      throw new NotFoundException('Message not found in this channel');
    }

    // message_reactions cascade via the `on delete cascade` FK.
    const { error } = await this.supabase.client.from('messages').delete().eq('id', messageId);
    if (error) throw error;
  }

  async deleteChannel(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('channels').delete().eq('id', id);
    if (error) throw error;
  }
}

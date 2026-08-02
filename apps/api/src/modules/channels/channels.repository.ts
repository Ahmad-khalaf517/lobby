import { Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import type { Channel, Message } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toChannel, toChannels, toMessage, toMessages } from './channels.mappers';

@Injectable()
export class ChannelsRepository {
  constructor(private readonly supabase: SupabaseService) {}

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
    const { data, error } = await this.supabase.client
      .from('messages')
      .insert({ channel_id: channelId, sender_id: senderId, content: text })
      .select('*, channel_members(guest_name, user_id)')
      .single();

    if (error) throw error;
    return toMessage(data);
  }

  async getMessages(channelId: string, limit = 100): Promise<Message[]> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .select('*, channel_members(guest_name, user_id)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return toMessages(data ?? []);
  }

  async deleteChannel(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('channels').delete().eq('id', id);
    if (error) throw error;
  }
}

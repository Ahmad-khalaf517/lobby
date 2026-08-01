import { Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import type { Channel, Message } from '@lobby/shared';
import { SupabaseService } from './supabase.service';
import { toChannel, toMessage, toMessages } from './mappers';

/**
 * Reference implementation of every query this app makes. Two tables, five
 * queries — if you find yourself adding a sixth, check whether it belongs
 * in the plan's scope first.
 */
@Injectable()
export class ChannelRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async createChannel(name?: string, ttlHours = 24): Promise<Channel> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .insert({
        id: nanoid(8),
        name: name ?? 'New room',
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
   * Insert first, then broadcast the returned row — so every client receives
   * the same id and timestamp the database assigned, rather than each one
   * generating its own.
   */
  async addMessage(
    channelId: string,
    authorName: string,
    text: string,
  ): Promise<Message> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .insert({ channel_id: channelId, author_name: authorName, text })
      .select()
      .single();

    if (error) throw error;
    return toMessage(data);
  }

  /** Backfill for a client that just opened the channel. Oldest → newest. */
  async getMessages(channelId: string, limit = 100): Promise<Message[]> {
    const { data, error } = await this.supabase.client
      .from('messages')
      .select()
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return toMessages(data ?? []);
  }

  /** Messages cascade automatically via the foreign key. */
  async deleteChannel(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('channels')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Channel } from '@lobby/shared';
import { toChannel, toChannels } from './channel.mappers';
import { SupabaseService } from '../database/supabase.service';
import { ChannelInsert, ChannelUpdate } from '../../database/types';

@Injectable()
export class ChannelsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async createChannelForServer(channel: ChannelInsert): Promise<Channel> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .insert(channel)
      .select()
      .single();

    if (error) throw error;
    return toChannel(data);
  }

  /**
   * Looks a channel up *within* a server. Scoping by server_id (rather than
   * fetching by id alone) means a channel id from another server can never be
   * mutated through that server's owner check.
   */
  async findChannelInServer(serverId: string, channelId: string): Promise<Channel> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .select()
      .eq('id', channelId)
      .eq('server_id', serverId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Channel not found on this server');
    return toChannel(data);
  }

  async updateChannel(serverId: string, channelId: string, name: string): Promise<Channel> {
    const update: ChannelUpdate = { name };
    const { data, error } = await this.supabase.client
      .from('channels')
      .update(update)
      .eq('id', channelId)
      .eq('server_id', serverId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Channel not found on this server');
    return toChannel(data);
  }

  async deleteChannel(serverId: string, channelId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('channels')
      .delete()
      .eq('id', channelId)
      .eq('server_id', serverId);

    if (error) throw error;
  }

  async countChannelsForServer(serverId: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('channels')
      .select('id', { count: 'exact', head: true })
      .eq('server_id', serverId);

    if (error) throw error;
    return count ?? 0;
  }

  /** Channels that belong to a server (channels.server_id), oldest first. */
  async listChannelsForServer(serverId: string): Promise<Channel[]> {
    const { data, error } = await this.supabase.client
      .from('channels')
      .select()
      .eq('server_id', serverId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return toChannels(data ?? []);
  }
}

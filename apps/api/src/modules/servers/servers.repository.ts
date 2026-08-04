import { Injectable, NotFoundException } from '@nestjs/common';
import { customAlphabet, nanoid } from 'nanoid';
import type { Channel, Server, ServerMember } from '@lobby/shared';
import type { Database } from '../../database/database.types';
import { toChannel, toChannels } from '../channels/channels.mappers';
import { SupabaseService } from '../database/supabase.service';
import { toServer, toServerMembers, toServers } from './servers.mappers';

type ServerInsert = Database['public']['Tables']['servers']['Insert'];
type ServerUpdate = Database['public']['Tables']['servers']['Update'];
type ServerMemberInsert = Database['public']['Tables']['server_members']['Insert'];
type ChannelInsert = Database['public']['Tables']['channels']['Insert'];
type UserInsert = Database['public']['Tables']['users']['Insert'];

// Invite codes are separate from server ids: short, unambiguous, shareable.
const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class ServersRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async createServer(ownerId: string, name: string): Promise<Server> {
    await this.ensureUserExists(ownerId);

    const server: ServerInsert = {
      owner_id: ownerId,
      name,
      invite_code: generateInviteCode(),
    };

    const { data, error } = await this.supabase.client
      .from('servers')
      .insert(server)
      .select()
      .single();

    if (error) throw error;
    const created = toServer(data);

    // Creating a server makes the creator its first member, with owner role.
    const member: ServerMemberInsert = {
      server_id: created.id,
      user_id: ownerId,
      role: 'owner',
    };
    const { error: memberError } = await this.supabase.client.from('server_members').insert(member);

    if (memberError) throw memberError;

    return created;
  }

  async findServer(id: string): Promise<Server> {
    const { data, error } = await this.supabase.client
      .from('servers')
      .select()
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Server not found');
    return toServer(data);
  }

  async findServerByInviteCode(inviteCode: string): Promise<Server> {
    const { data, error } = await this.supabase.client
      .from('servers')
      .select()
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Invalid invite code');
    return toServer(data);
  }

  async updateServer(id: string, name: string): Promise<Server> {
    const update: ServerUpdate = { name };
    const { data, error } = await this.supabase.client
      .from('servers')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Server not found');
    return toServer(data);
  }

  async listServersForUser(userId: string): Promise<Server[]> {
    const { data, error } = await this.supabase.client
      .from('server_members')
      .select('servers(*)')
      .eq('user_id', userId);

    if (error) throw error;
    // Supabase returns the joined row nested under the relation name.
    const rows = (data ?? [])
      .map((row: { servers: Parameters<typeof toServer>[0] | null }) => row.servers)
      .filter((row): row is Parameters<typeof toServer>[0] => row !== null);
    return toServers(rows);
  }

  async addMember(serverId: string, userId: string, role = 'member'): Promise<ServerMember> {
    await this.ensureUserExists(userId);

    const member: ServerMemberInsert = { server_id: serverId, user_id: userId, role };
    const { data, error } = await this.supabase.client
      .from('server_members')
      .insert(member)
      .select()
      .single();

    if (error) throw error;
    return toServerMembers([data])[0];
  }

  async isMember(serverId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('server_members')
      .select('id')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  }

  async listMembers(serverId: string): Promise<ServerMember[]> {
    const { data, error } = await this.supabase.client
      .from('server_members')
      .select()
      .eq('server_id', serverId);

    if (error) throw error;
    return toServerMembers(data ?? []);
  }

  async removeMember(serverId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId);

    if (error) throw error;
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

  async createChannelForServer(serverId: string, name: string): Promise<Channel> {
    const channel: ChannelInsert = {
      id: nanoid(8),
      name,
      server_id: serverId,
    };

    const { data, error } = await this.supabase.client
      .from('channels')
      .insert(channel)
      .select()
      .single();

    if (error) throw error;
    return toChannel(data);
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const userName = `User ${userId.slice(0, 8)}`;
    const user: UserInsert = {
      id: userId,
      name: userName,
    };

    const { error } = await this.supabase.client.from('users').upsert(user, { onConflict: 'id' });

    if (error) throw error;
  }
}

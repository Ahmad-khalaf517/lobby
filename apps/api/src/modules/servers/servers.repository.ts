import { Injectable, NotFoundException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import type { User } from '@supabase/supabase-js';
import type { Server, ServerMember } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toServer, toServerMembers, toServers } from './servers.mappers';
import { ChannelService } from '../channels/channel.service';
import { ServerInsert, ServerMemberInsert, ServerUpdate, UserInsert } from '../../database/types';

// Invite codes are separate from server ids: short, unambiguous, shareable.
const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class ServersRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly channelService: ChannelService,
  ) {}

  async createServer(owner: User, name: string): Promise<Server> {
    await this.ensureUserExists(owner);

    const server: ServerInsert = {
      owner_id: owner.id,
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
      user_id: owner.id,
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

  async addMember(
    serverId: string,
    user: User,
    role: ServerMemberInsert['role'] = 'member',
  ): Promise<ServerMember> {
    await this.ensureUserExists(user);

    const member: ServerMemberInsert = { server_id: serverId, user_id: user.id, role };
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

  /**
   * Upserts the users row backing this authenticated user. Prefers the real
   * display name set at signup (user_metadata.name — see auth.service.ts's
   * signUp call) so servers/members show real names instead of a
   * fabricated placeholder for every user.
   */
  private async ensureUserExists(authUser: User): Promise<void> {
    const metadataName =
      typeof authUser.user_metadata?.['name'] === 'string'
        ? (authUser.user_metadata['name'] as string).trim()
        : '';
    const name = metadataName || `User ${authUser.id.slice(0, 8)}`;

    const user: UserInsert = {
      id: authUser.id,
      name,
      user_name: name.toLowerCase().replace(/\s+/g, '_'),
    };

    const { error } = await this.supabase.client.from('users').upsert(user, { onConflict: 'id' });

    if (error) throw error;
  }
}

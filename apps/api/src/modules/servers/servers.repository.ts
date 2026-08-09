import { Injectable, NotFoundException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import type { User } from '@supabase/supabase-js';
import type { Server } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toServer, toServers } from './servers.mappers';
import { ServerInsert, ServerUpdate, UserInsert } from '../../database/types';

// Invite codes are separate from server ids: short, unambiguous, shareable.
const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class ServersRepository {
  constructor(private readonly supabase: SupabaseService) {}

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
    return toServer(data);
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

  /**
   * Scaffolds a `users` row the first time this id is seen. Deliberately
   * insert-only, not upsert: this runs on every createServer/joinServer
   * call, and an unconditional upsert would silently clobber a
   * name/username the person has since customized via the profile panel.
   */
  async ensureUserExists(authUser: User | string): Promise<void> {
    const id = typeof authUser === 'string' ? authUser : authUser.id;

    const { data: existing, error: selectError } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (selectError) throw selectError;
    if (existing) return;

    const metadataName =
      typeof authUser !== 'string' && typeof authUser.user_metadata?.['name'] === 'string'
        ? (authUser.user_metadata['name'] as string).trim()
        : '';
    const name = metadataName || `User ${id.slice(0, 8)}`;

    const user: UserInsert = {
      id,
      name,
      user_name: name.toLowerCase().replace(/\s+/g, '_'),
    };

    const { error } = await this.supabase.client.from('users').insert(user);

    if (error) throw error;
  }
}

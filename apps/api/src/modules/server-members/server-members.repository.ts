import { Injectable } from '@nestjs/common';
import type { ServerMember } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toServerMembers } from './server-members.mappers';
import { ServerMemberInsert } from '../../database/types';

@Injectable()
export class ServerMembersRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** Caller is responsible for making sure the `users` row already exists. */
  async addMember(
    serverId: string,
    userId: string,
    role: ServerMemberInsert['role'] = 'member',
  ): Promise<ServerMember> {
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
}

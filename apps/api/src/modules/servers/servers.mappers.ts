import type { Server, ServerMember } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type ServerRow = Database['public']['Tables']['servers']['Row'];
type ServerMemberRow = Database['public']['Tables']['server_members']['Row'];

export function toServer(row: ServerRow): Server {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
  };
}

export const toServers = (rows: ServerRow[]): Server[] => rows.map(toServer);

export function toServerMember(row: ServerMemberRow): ServerMember {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    role: row.role as ServerMember['role'],
    joinedAt: row.joined_at,
  };
}

export const toServerMembers = (rows: ServerMemberRow[]): ServerMember[] =>
  rows.map(toServerMember);

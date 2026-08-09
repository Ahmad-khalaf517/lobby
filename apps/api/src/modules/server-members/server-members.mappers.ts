import type { ServerMember } from '@lobby/shared';
import { ServerMemberRow } from '../../database/types';

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

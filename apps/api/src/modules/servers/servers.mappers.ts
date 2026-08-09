import type { Server } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type ServerRow = Database['public']['Tables']['servers']['Row'];

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

import type { Channel } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type ChannelRow = Database['public']['Tables']['channels']['Row'];

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export const toChannels = (rows: ChannelRow[]): Channel[] => rows.map(toChannel);

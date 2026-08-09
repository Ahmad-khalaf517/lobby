import type { Channel } from '@lobby/shared';
import { ChannelRow } from '../../database/types';

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    created_by: row.created_by,
    server_id: row.server_id,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const toChannels = (rows: ChannelRow[]): Channel[] => rows.map(toChannel);

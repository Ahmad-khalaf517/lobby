import type { Channel, Message } from '@lobby/shared';
import type { ChannelRow, MessageRow } from '../database/database.types';

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorName: row.author_name,
    text: row.text,
    createdAt: row.created_at,
  };
}

export const toMessages = (rows: MessageRow[]): Message[] => rows.map(toMessage);

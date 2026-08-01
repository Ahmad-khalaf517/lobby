/**
 * Row → contract mappers.
 *
 * This is the ONLY place snake_case becomes camelCase. Every service that
 * reads from Supabase returns mapped objects, never raw rows — that way a
 * column rename is a one-file change here instead of a breaking change to
 * apps/web.
 */
import type { Channel, Message } from '@lobby/shared';
import type { ChannelRow, MessageRow } from './database.types';

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

export const toChannels = (rows: ChannelRow[]): Channel[] => rows.map(toChannel);
export const toMessages = (rows: MessageRow[]): Message[] => rows.map(toMessage);

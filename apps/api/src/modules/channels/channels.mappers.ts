import type { Channel, Message } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type ChannelRow = Database['public']['Tables']['channels']['Row'];
type ChannelMemberRow = Database['public']['Tables']['channel_members']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type MessageWithAuthorRow = MessageRow & {
  channel_members: Pick<ChannelMemberRow, 'guest_name' | 'user_id'> | null;
  message_reactions?: Array<{
    emoji: string;
    channel_members: Pick<ChannelMemberRow, 'guest_name' | 'user_id'> | null;
  }> | null;
};

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export const toChannels = (rows: ChannelRow[]): Channel[] => rows.map(toChannel);

/**
 * A message's author lives on the joined `channel_members` row, not on the
 * message itself — see MessageRow in database.types.ts. Guests only (no
 * authenticated `users` flow exists yet in apps/api), hence guest_name only.
 */
export function toMessage(row: MessageWithAuthorRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorName: row.channel_members?.guest_name ?? 'Unknown',
    text: row.content,
    reactions: (row.message_reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      reactedBy: reaction.channel_members?.guest_name ?? 'Unknown',
    })),
    createdAt: row.created_at,
  };
}

export const toMessages = (rows: MessageWithAuthorRow[]): Message[] => rows.map(toMessage);

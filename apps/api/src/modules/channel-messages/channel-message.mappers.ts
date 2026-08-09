import type { ChannelMessage, ChannelMessagePreview, ChannelMessageReaction } from '@lobby/shared';
import type { UserProfile } from '@lobby/shared';
import type { Database } from '../../database/database.types';

export type ChannelMessageRow = Database['public']['Tables']['messages']['Row'];
export type ChannelMessageReactionRow = Database['public']['Tables']['message_reactions']['Row'];
export type ChannelMemberRow = Database['public']['Tables']['channel_members']['Row'];

export function toChannelMessage(
  row: ChannelMessageRow,
  author: UserProfile,
  replyTo: ChannelMessagePreview | null,
  reactions: ChannelMessageReaction[],
): ChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    content: row.content,
    author,
    replyTo,
    reactions,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

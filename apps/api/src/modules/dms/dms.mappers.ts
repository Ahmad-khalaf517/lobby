import type { DmMessage } from '@lobby/shared';
import type { Database } from '../../database/database.types';

export type DmConversationRow = Database['public']['Tables']['dm_conversations']['Row'];
export type DmMessageRow = Database['public']['Tables']['dm_messages']['Row'];

export function toDmMessage(row: DmMessageRow): DmMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    // DB column is `content` (matches the channel `messages` table); the API
    // field is `body`.
    body: row.content,
    reactionEmoji: row.reaction_emoji,
    createdAt: row.created_at,
  };
}

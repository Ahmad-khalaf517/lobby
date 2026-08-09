import type { DmMessage } from '@lobby/shared';
import type { Database } from '../../database/database.types';

export type DmConversationRow = Database['public']['Tables']['dm_conversations']['Row'];
export type DmMessageRow = Database['public']['Tables']['dm_messages']['Row'];

export function toDmMessage(row: DmMessageRow): DmMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    clientMessageId: row.client_message_id,
    // DB column is `content` (matches the channel `messages` table); the API
    // field is `body`.
    body: row.content,
    reactionEmoji: row.reaction_emoji,
    reactionUserId: row.reaction_user_id,
    replyToMessageId: row.reply_to,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

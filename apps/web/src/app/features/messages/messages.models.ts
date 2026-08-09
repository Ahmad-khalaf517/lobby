import type { Person } from '../../shared/components/person-avatar/person.model';

/**
 * Direct messages domain models, mapped from the backend DMs REST API.
 * Conversations are keyed by `friendId` (the other user's id) so the
 * `/messages/:friendId` route maps straight onto a conversation.
 */

export interface Conversation {
  /** The other user's id — matches the `/messages/:friendId` route param. */
  friendId: string;
  /** Backend conversation id — used for GET/POST messages. */
  conversationId: string;
  /** Number of unseen messages (local-only for now — no read-status API yet). */
  unread: number;
  /** ISO timestamp of the newest message (drives sidebar ordering). */
  lastMessageAt: string;
  /** Preview text of the newest message. */
  preview: string | null;
  /** The other participant, for the sidebar / chat header. */
  partner: Person;
}

export type ConversationRow = Conversation;

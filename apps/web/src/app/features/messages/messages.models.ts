import type { Person } from '../../shared/components/person-avatar/person.model';

/**
 * Direct messages domain models. Conversations are keyed by `friendId` so the
 * `/messages/:friendId` route maps straight onto a conversation. Replace the
 * mock store in `DirectMessagesService` with real APIs later without touching
 * the components.
 */

export interface Conversation {
  friendId: string;
  /** Number of unseen messages from the other person. */
  unread: number;
  /** ISO timestamp of the newest message (drives sidebar ordering). */
  lastMessageAt: string;
}

/** A conversation combined with its partner + last-message preview for the sidebar. */
export interface ConversationRow extends Conversation {
  partner: Person;
  preview: string;
}

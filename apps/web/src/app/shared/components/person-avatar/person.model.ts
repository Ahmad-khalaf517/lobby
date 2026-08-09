import type { ChatUserStatus } from '../room-chat/models/chat-user.model';

/**
 * A reusable "person" descriptor used by the friends + direct-messages features.
 * Keeps the avatar presentation (initials + brand color) next to the identity
 * so a single object can drive <app-person-avatar> anywhere a person is shown.
 * When real APIs arrive, this shape maps 1:1 onto the backend user/friend DTOs.
 */
export interface Person {
  /** Stable user id (matches `/messages/:friendId` routing). */
  id: string;
  /** Display name. */
  name: string;
  /** Real photo, if the person has one. Falls back to initials when null/omitted. */
  avatarUrl?: string | null;
  /** Override the initials shown on the avatar (defaults to a derivation of `name`). */
  initials?: string;
  /** Solid avatar background color (brand color for the person). */
  color?: string;
  /** Avatar text color on top of `color`. */
  textColor?: string;
  /** Optional presence dot (online / offline / muted). */
  status?: ChatUserStatus;
  /** Human-friendly "last seen" label, e.g. "2h ago". Shown when offline. */
  lastSeen?: string;
}

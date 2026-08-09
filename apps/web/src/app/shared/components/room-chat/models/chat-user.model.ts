/**
 * A chat participant / user. Generic enough to represent the current user, a
 * message author, or a participant on the future call page's participants list.
 */
export type ChatUserStatus = 'online' | 'offline' | 'muted';

export interface ChatUser {
  /** Stable id. In a guest room this is the display name; on a signed-in page it's the user id. */
  id: string;
  /** Display name shown next to messages / avatars. */
  name: string;
  /** Override the initials shown on the avatar (defaults to a derivation of `name`). */
  initials?: string;
  /** Real photo, if the person has one. Falls back to initials when null/omitted. */
  avatarUrl?: string | null;
  /** Override the avatar gradient color (defaults to a name-hashed hsla color). */
  avatarColor?: string;
  /** Optional presence dot (online / muted) on the avatar. Omit for no dot. */
  status?: ChatUserStatus;
}

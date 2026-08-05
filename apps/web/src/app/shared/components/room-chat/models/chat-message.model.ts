import type { ChatUser } from './chat-user.model';

/**
 * A single aggregated reaction chip shown under a message. The page that owns
 * the chat data is responsible for computing these (it already tracks per-user
 * reactions), so the presentational components stay purely "dumb".
 */
export interface ChatReaction {
  emoji: string;
  count: number;
  /** True when the current user has reacted with this emoji (chip is highlighted). */
  reactedByMe: boolean;
}

/** UI-facing chat message — the page maps its domain model into this shape. */
export interface ChatMessage {
  id: string;
  author: ChatUser;
  text: string;
  createdAt: string;
  /** Reaction chips to render under the message, ordered by count (desc). */
  reactions: ChatReaction[];
  /** Emoji the current user reacted with on this message, or null. */
  ownReaction: string | null;
  /** True when the message was edited after being sent (renders "(edited)"). */
  edited?: boolean;
  /** When set, the message is a reply quoting another message. */
  replyTo?: {
    messageId: string;
    authorName: string;
    text: string;
  };
}

/** The "Replying to …" banner shown above the composer. */
export interface ChatReplyPreview {
  messageId: string;
  authorName: string;
  text: string;
}

/** Default emoji set shared by the composer picker and the message reaction menu. */
export const DEFAULT_CHAT_EMOJIS: string[] = [
  '😀',
  '😂',
  '😍',
  '😎',
  '🤔',
  '👏',
  '🙌',
  '🔥',
  '💯',
  '🎉',
  '👍',
  '❤️',
];

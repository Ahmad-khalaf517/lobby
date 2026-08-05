import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '../constants/limits.js';

/** Socket: chatMessage — client → server payload */
export const ChatMessagePayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;

/** A single user's persisted reaction on a message. */
export const MessageReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  reactedBy: z.string().min(1).max(MAX_NAME_LENGTH),
});
export type MessageReaction = z.infer<typeof MessageReactionSchema>;

/**
 * A persisted message, as stored in Supabase and returned to clients.
 * Note `id` and `createdAt` are assigned by the database, so this shape
 * only exists after a successful insert — it is not what the client sends.
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  authorName: z.string(),
  text: z.string(),
  reactions: z.array(MessageReactionSchema).catch([]),
  // { offset: true } — Supabase/PostgREST serializes timestamptz as
  // "...+00:00", not the "Z" suffix z.string().datetime() requires by default.
  createdAt: z.string().datetime({ offset: true }),
});
export type Message = z.infer<typeof MessageSchema>;

/**
 * Socket: chatMessage — server → client broadcast.
 * Same shape as a persisted message: the server inserts first, then
 * broadcasts the stored row, so every client sees the same id and
 * timestamp the database assigned.
 */
export const ChatMessageBroadcastSchema = MessageSchema;
export type ChatMessageBroadcast = z.infer<typeof ChatMessageBroadcastSchema>;

/** Socket: messageReaction — client → server payload */
export const MessageReactionPayloadSchema = z.object({
  channelId: z.string(),
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(8),
});
export type MessageReactionPayload = z.infer<typeof MessageReactionPayloadSchema>;

/** Socket: messageReaction — server → client broadcast */
export const MessageReactionBroadcastSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(8),
  reactedBy: z.string().min(1).max(MAX_NAME_LENGTH),
  /** True when this broadcast removes `reactedBy`'s reaction; false when adding/changing it. */
  removed: z.boolean(),
});
export type MessageReactionBroadcast = z.infer<typeof MessageReactionBroadcastSchema>;

/** Socket: deleteMessage — client → server payload */
export const DeleteMessagePayloadSchema = z.object({
  channelId: z.string(),
  messageId: z.string().uuid(),
});
export type DeleteMessagePayload = z.infer<typeof DeleteMessagePayloadSchema>;

/** Socket: messageDeleted — server → client broadcast */
export const MessageDeletedBroadcastSchema = z.object({
  messageId: z.string().uuid(),
});
export type MessageDeletedBroadcast = z.infer<typeof MessageDeletedBroadcastSchema>;

/**
 * REST: GET /channels/:id/messages — response.
 * Sent when a client first opens a channel, to backfill history that was
 * posted before they joined. Ordered oldest → newest.
 */
export const MessageHistorySchema = z.object({
  messages: z.array(MessageSchema),
});
export type MessageHistory = z.infer<typeof MessageHistorySchema>;

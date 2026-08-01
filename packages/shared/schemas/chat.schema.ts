import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '../constants/limits.js';

/** Socket: chatMessage — client → server payload */
export const ChatMessagePayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;

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
  createdAt: z.string().datetime(),
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

/**
 * REST: GET /channels/:id/messages — response.
 * Sent when a client first opens a channel, to backfill history that was
 * posted before they joined. Ordered oldest → newest.
 */
export const MessageHistorySchema = z.object({
  messages: z.array(MessageSchema),
});
export type MessageHistory = z.infer<typeof MessageHistorySchema>;

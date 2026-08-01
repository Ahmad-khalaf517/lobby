import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '../constants/limits.js';

/** Socket: chatMessage — client → server payload */
export const ChatMessagePayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;

/** Socket: chatMessage — server → client broadcast */
export const ChatMessageBroadcastSchema = z.object({
  name: z.string(),
  text: z.string(),
  time: z.string().datetime(),
});
export type ChatMessageBroadcast = z.infer<typeof ChatMessageBroadcastSchema>;

import { z } from 'zod';
import { MAX_NAME_LENGTH } from '../constants/limits.js';

/** Socket: typing — client → server payload */
export const TypingPayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  isTyping: z.boolean(),
});
export type TypingPayload = z.infer<typeof TypingPayloadSchema>;

/** Socket: typing — server → client broadcast */
export const TypingBroadcastSchema = z.object({
  name: z.string(),
  isTyping: z.boolean(),
});
export type TypingBroadcast = z.infer<typeof TypingBroadcastSchema>;

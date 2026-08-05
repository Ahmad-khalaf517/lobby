import { z } from 'zod';
import { MAX_CHANNEL_NAME_LENGTH } from '../constants/limits.js';

/** A persisted channel record (matches the `channels` row in Supabase). */
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH),
  // { offset: true } — Supabase/PostgREST serializes timestamptz as
  // "...+00:00", not the "Z" suffix z.string().datetime() requires by default.
  createdAt: z.string().datetime({ offset: true }),
  /** When the room and its messages expire. Null means no expiry. */
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});
export type Channel = z.infer<typeof ChannelSchema>;

import { z } from 'zod';
import { MAX_CHANNEL_NAME_LENGTH, MAX_NAME_LENGTH } from '../constants/limits.js';

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

/** REST: POST /channels — request body (channel name is optional, server can default it) */
export const CreateChannelRequestSchema = z.object({
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH).optional(),
});
export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>;

/** REST: POST /channels — response */
export const CreateChannelResponseSchema = ChannelSchema;
export type CreateChannelResponse = z.infer<typeof CreateChannelResponseSchema>;

/**
 * REST: GET /channels — response.
 * Lists open (non-expired) channels so a guest can browse and pick one
 * without already having a link. Note: this makes every open channel
 * discoverable, not just ones a guest was directly linked to — see the
 * callout in docs/CREATING_A_CHANNEL.md.
 */
export const ChannelListResponseSchema = z.object({
  channels: z.array(ChannelSchema),
});
export type ChannelListResponse = z.infer<typeof ChannelListResponseSchema>;

/** Socket: joinChannel — client → server payload */
export const JoinChannelPayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
});
export type JoinChannelPayload = z.infer<typeof JoinChannelPayloadSchema>;

/** Socket: leaveChannel — client → server payload */
export const LeaveChannelPayloadSchema = z.object({
  channelId: z.string(),
});
export type LeaveChannelPayload = z.infer<typeof LeaveChannelPayloadSchema>;

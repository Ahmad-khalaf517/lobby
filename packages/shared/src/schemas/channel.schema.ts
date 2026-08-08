import { z } from 'zod';
import { MAX_CHANNEL_NAME_LENGTH } from '../constants/limits.js';

/** A persisted channel record (matches the `channels` row in Supabase). */
export const ChannelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH),
  // { offset: true } — Supabase/PostgREST serializes timestamptz as
  // "...+00:00", not the "Z" suffix z.string().datetime() requires by default.
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  server_id: z.string().uuid(),
  created_by: z.string().uuid(),
});
export type Channel = z.infer<typeof ChannelSchema>;

/** REST: POST /servers/:id/channels — request body */
export const CreateChannelRequestSchema = z.object({
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH),
});
export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>;

export const CreateChannelResponseSchema = ChannelSchema;
export type CreateChannelResponse = z.infer<typeof CreateChannelResponseSchema>;

/** REST: PATCH /servers/:serverId/channels/:channelId — request body */
export const UpdateChannelRequestSchema = z.object({
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH),
});
export type UpdateChannelRequest = z.infer<typeof UpdateChannelRequestSchema>;

export const UpdateChannelResponseSchema = ChannelSchema;
export type UpdateChannelResponse = z.infer<typeof UpdateChannelResponseSchema>;

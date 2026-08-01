import { z } from 'zod';
import { MAX_CHANNEL_NAME_LENGTH, MAX_NAME_LENGTH } from '../constants/limits.js';

/** A persisted channel record (matches the SQLite row in apps/api). */
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(MAX_CHANNEL_NAME_LENGTH),
  createdAt: z.string().datetime(),
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

import { z } from 'zod';
import {
  MAX_CALL_PARTICIPANTS,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_GUEST_ROOM_LIFETIME_MINUTES,
  MIN_CALL_PARTICIPANTS,
  MIN_GUEST_ROOM_LIFETIME_MINUTES,
} from '../constants/limits.js';

/** REST: POST /guest/channels - registered creator request. */
export const GuestChannelCreateRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Room name is required')
    .max(
      MAX_CHANNEL_NAME_LENGTH,
      `Room name must contain at most ${MAX_CHANNEL_NAME_LENGTH} characters`,
    ),
  maxParticipants: z
    .number()
    .int('Call capacity must be a whole number')
    .min(MIN_CALL_PARTICIPANTS, `Call capacity must be at least ${MIN_CALL_PARTICIPANTS}`)
    .max(MAX_CALL_PARTICIPANTS, `Call capacity cannot exceed ${MAX_CALL_PARTICIPANTS}`),
  lifetimeMinutes: z
    .number()
    .int('Room lifetime must be a whole number of minutes')
    .min(
      MIN_GUEST_ROOM_LIFETIME_MINUTES,
      `Room lifetime must be at least ${MIN_GUEST_ROOM_LIFETIME_MINUTES} minutes`,
    )
    .max(
      MAX_GUEST_ROOM_LIFETIME_MINUTES,
      `Room lifetime cannot exceed ${MAX_GUEST_ROOM_LIFETIME_MINUTES} minutes`,
    ),
});
export type GuestChannelCreateRequest = z.infer<typeof GuestChannelCreateRequestSchema>;

/** REST: POST /guest/channels - response. */
export const GuestChannelCreateResponseSchema = z.object({
  channelId: z.string().uuid(),
  code: z.string().regex(/^[A-Z0-9]{8,12}$/),
});
export type GuestChannelCreateResponse = z.infer<typeof GuestChannelCreateResponseSchema>;

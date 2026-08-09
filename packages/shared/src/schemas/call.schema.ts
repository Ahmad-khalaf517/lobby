import { z } from 'zod';
import { MAX_CALL_PARTICIPANTS, MIN_CALL_PARTICIPANTS } from '../constants/limits.js';

/**
 * Calls now go through LiveKit (SFU), not a hand-rolled WebRTC signaling relay.
 * apps/api never transports media; it mints short-lived LiveKit access tokens
 * and performs privileged room cleanup for moderated participants over REST.
 *
 * There is no "join call" socket event: the frontend calls this REST endpoint,
 * then connects directly to LiveKit using the returned token and URL. Socket.IO
 * is uninvolved in the call path entirely.
 */

/** REST: POST /livekit/token - request body */
export const CallTokenRequestSchema = z.object({
  channelId: z.string().uuid(),
});
export type CallTokenRequest = z.infer<typeof CallTokenRequestSchema>;

/** REST: POST /livekit/token - response */
export const CallTokenResponseSchema = z.object({
  token: z.string(),
  livekitUrl: z.string().url(),
  roomName: z.string(),
});
export type CallTokenResponse = z.infer<typeof CallTokenResponseSchema>;

/**
 * REST: GET /channels/:channelId/call-status - response.
 * Lets the web app tell whether a LiveKit call is actually live in a channel
 * (the API is the only party with LiveKit credentials).
 */
export const CallStatusResponseSchema = z.object({
  active: z.boolean(),
  participants: z.number().int().nonnegative(),
  maxParticipants: z.number().int().min(MIN_CALL_PARTICIPANTS).max(MAX_CALL_PARTICIPANTS),
});
export type CallStatusResponse = z.infer<typeof CallStatusResponseSchema>;

/**
 * REST: POST /livekit/remove-participant - request.
 * The guest database RPC has already marked this membership removed; NestJS
 * verifies the owner and removal before revoking the active LiveKit session.
 */
export const CallParticipantRemovalRequestSchema = z.object({
  channelId: z.string().uuid(),
  memberId: z.string().uuid(),
});
export type CallParticipantRemovalRequest = z.infer<typeof CallParticipantRemovalRequestSchema>;

/** REST: POST /livekit/remove-participant - response. */
export const CallParticipantRemovalResponseSchema = z.object({
  removed: z.boolean(),
});
export type CallParticipantRemovalResponse = z.infer<typeof CallParticipantRemovalResponseSchema>;

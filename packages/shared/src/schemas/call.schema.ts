import { z } from 'zod';

/**
 * Calls now go through LiveKit (SFU), not a hand-rolled WebRTC signaling relay.
 * apps/api never touches media; its only job is to mint a short-lived LiveKit
 * access token for a given channel/participant, over plain REST.
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
});
export type CallStatusResponse = z.infer<typeof CallStatusResponseSchema>;

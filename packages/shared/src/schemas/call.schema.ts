import { z } from 'zod';
import { MAX_NAME_LENGTH } from '../constants/limits.js';

/**
 * Calls now go through LiveKit (SFU), not a hand-rolled WebRTC signaling relay.
 * apps/api never touches media — its only job is to mint a short-lived LiveKit
 * access token for a given channel/participant, over plain REST.
 *
 * There is no "join call" socket event: the frontend calls this REST endpoint,
 * then connects directly to LiveKit using the returned token and URL. Socket.IO
 * is uninvolved in the call path entirely.
 */

/** REST: POST /channels/:channelId/call-token — request body */
export const CallTokenRequestSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH),
});
export type CallTokenRequest = z.infer<typeof CallTokenRequestSchema>;

/** REST: POST /channels/:channelId/call-token — response */
export const CallTokenResponseSchema = z.object({
  token: z.string(),
  livekitUrl: z.string().url(),
  roomName: z.string(),
});
export type CallTokenResponse = z.infer<typeof CallTokenResponseSchema>;

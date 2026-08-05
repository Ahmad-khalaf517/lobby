import { z } from 'zod';

/**
 * Screen-share exclusivity ("only one participant at a time") is app-level
 * business logic — LiveKit has no concept of it. Coordinated over Socket.IO,
 * the same way chat/presence are: live, in-memory, per-channel state, not
 * persisted to Supabase.
 *
 * Identity for start/stop comes from the server-side channelMembers map
 * (set at joinChannel), not a client-supplied name — same trust model as
 * handleChatMessage/handleMessageReaction in the gateway. That's why these
 * payloads only carry channelId.
 *
 * Flow:
 *   1. Client emits SCREEN_SHARE_REQUEST *before* calling
 *      localParticipant.setScreenShareEnabled(true) on the LiveKit room.
 *   2. Gateway acks { success: true } or { success: false, reason }.
 *   3. Only on success does the client actually start publishing.
 *   4. Gateway broadcasts SCREEN_SHARE_STATE to the whole channel room
 *      whenever the sharer changes (start, voluntary stop, leave, or disconnect).
 */

/** socket: client -> server, requesting to start sharing */
export const ScreenShareRequestSchema = z.object({
  channelId: z.string(),
});
export type ScreenShareRequest = z.infer<typeof ScreenShareRequestSchema>;

/** socket: client -> server, voluntarily stopping */
export const ScreenShareStopRequestSchema = z.object({
  channelId: z.string(),
});
export type ScreenShareStopRequest = z.infer<typeof ScreenShareStopRequestSchema>;

/** socket: server -> requester only, immediate ack (via Socket.IO's callback/acknowledgement) */
export const ScreenShareAckSchema = z.object({
  success: z.boolean(),
  reason: z.string().optional(),
});
export type ScreenShareAck = z.infer<typeof ScreenShareAckSchema>;

/** socket: server -> everyone in the channel room, current sharer state */
export const ScreenShareStateSchema = z.object({
  channelId: z.string(),
  sharing: z.boolean(),
  sharerName: z.string().nullable(),
  sharerSocketId: z.string().nullable(),
});
export type ScreenShareState = z.infer<typeof ScreenShareStateSchema>;

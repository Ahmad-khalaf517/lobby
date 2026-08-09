import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../constants/limits.js';
import { UserProfileSchema } from './user-profile.schema.js';

// ---------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------

/**
 * REST: POST /servers/:serverId/channels/:channelId/messages — body.
 */
export const SendChannelMessageRequestSchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  /** Id of another message in the same channel this one replies to. */
  replyToMessageId: z.string().uuid().nullable().optional(),
});
export type SendChannelMessageRequest = z.infer<typeof SendChannelMessageRequestSchema>;

/** REST: PATCH /servers/:serverId/channels/:channelId/messages/:messageId — body */
export const UpdateChannelMessageRequestSchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type UpdateChannelMessageRequest = z.infer<typeof UpdateChannelMessageRequestSchema>;

/** REST: PUT /servers/:serverId/channels/:channelId/messages/:messageId/reaction — body */
export const SetChannelMessageReactionRequestSchema = z.object({
  emoji: z.string().min(1).max(16),
});
export type SetChannelMessageReactionRequest = z.infer<
  typeof SetChannelMessageReactionRequestSchema
>;

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

/** One reaction on a message, rolled up per emoji. */
export const ChannelMessageReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  count: z.number().int().positive(),
  /** Whether the viewing user is among the reactors. */
  reactedByMe: z.boolean(),
});
export type ChannelMessageReaction = z.infer<typeof ChannelMessageReactionSchema>;

/** Compact snapshot of the message being replied to (author + first line). */
export const ChannelMessagePreviewSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  author: UserProfileSchema,
});
export type ChannelMessagePreview = z.infer<typeof ChannelMessagePreviewSchema>;

/**
 * A persisted channel message. `author` is the sender's full profile, resolved
 * from `messages.sender_id` → `channel_members.user_id` → `users`.
 */
export const ChannelMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  author: UserProfileSchema,
  replyTo: ChannelMessagePreviewSchema.nullable(),
  reactions: z.array(ChannelMessageReactionSchema),
  // { offset: true } — Supabase/PostgREST serializes timestamptz as
  // "...+00:00", not the "Z" suffix z.string().datetime() requires by default.
  createdAt: z.string().datetime({ offset: true }),
  editedAt: z.string().datetime({ offset: true }).nullable(),
});
export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;

/** REST: GET /servers/:serverId/channels/:channelId/messages — response */
export const ChannelMessageListResponseSchema = z.object({
  messages: z.array(ChannelMessageSchema),
});
export type ChannelMessageListResponse = z.infer<typeof ChannelMessageListResponseSchema>;

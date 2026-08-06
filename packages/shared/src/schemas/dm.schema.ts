import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../constants/limits.js';
import { UserProfileSchema } from './user-profile.schema.js';

// ---------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------

/** REST: POST /dms — body */
export const CreateDmRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type CreateDmRequest = z.infer<typeof CreateDmRequestSchema>;

/** REST: POST /dms/:conversationId/messages — body */
export const SendDmMessageRequestSchema = z.object({
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type SendDmMessageRequest = z.infer<typeof SendDmMessageRequestSchema>;

export const ConversationIdParamSchema = z.object({
  conversationId: z.string().uuid(),
});
export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

/** A single persisted 1:1 message. */
export const DmMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  // { offset: true } — Supabase/PostgREST serializes timestamptz as
  // "...+00:00", not the "Z" suffix z.string().datetime() requires by default.
  createdAt: z.string().datetime({ offset: true }),
});
export type DmMessage = z.infer<typeof DmMessageSchema>;

/**
 * A conversation as seen by one participant. `user` is always the OTHER
 * person (never the viewer), and `areFriends` tells the client whether to
 * show the "Add friend" affordance instead of a friend-only action.
 */
export const DmConversationSchema = z.object({
  conversationId: z.string().uuid(),
  user: UserProfileSchema,
  areFriends: z.boolean(),
  lastMessage: DmMessageSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type DmConversation = z.infer<typeof DmConversationSchema>;

export const DmListResponseSchema = z.array(DmConversationSchema);
export const DmMessageHistorySchema = z.array(DmMessageSchema);

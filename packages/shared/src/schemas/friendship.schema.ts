import { z } from 'zod';

/**
 * Mirrors the `status` check constraint on schema.friendships:
 *   pending  -> request sent, awaiting response
 *   accepted -> mutual friends
 *   blocked  -> see blockedBy for which side performed the block
 */
export const FriendshipStatusSchema = z.enum(['pending', 'accepted', 'blocked']);
export type FriendshipStatus = z.infer<typeof FriendshipStatusSchema>;

// ---------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------

export const SendFriendRequestSchema = z.object({
  addresseeId: z.string().uuid(),
});
export type SendFriendRequestPayload = z.infer<typeof SendFriendRequestSchema>;

export const BlockUserSchema = z.object({
  userId: z.string().uuid(),
});
export type BlockUserPayload = z.infer<typeof BlockUserSchema>;

export const FriendshipIdParamSchema = z.object({
  friendshipId: z.string().uuid(),
});
export type FriendshipIdParam = z.infer<typeof FriendshipIdParamSchema>;

export const UserIdParamSchema = z.object({
  userId: z.string().uuid(),
});
export type UserIdParam = z.infer<typeof UserIdParamSchema>;

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

/** Raw row shape, camelCased. Rarely returned directly to clients — see FriendSchema below. */
export const FriendshipSchema = z.object({
  id: z.string().uuid(),
  requesterId: z.string().uuid(),
  addresseeId: z.string().uuid(),
  status: FriendshipStatusSchema,
  blockedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Friendship = z.infer<typeof FriendshipSchema>;

/** The OTHER user in a relationship — joined from the `users` table. */
export const FriendUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  userName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type FriendUser = z.infer<typeof FriendUserSchema>;

/**
 * What list endpoints actually return. A raw Friendship row doesn't tell
 * the caller which side of requesterId/addresseeId *they* are — this
 * shape resolves that from the viewer's perspective, and carries the
 * other user's profile so a friends list can render without extra calls.
 */
export const FriendSchema = z.object({
  friendshipId: z.string().uuid(),
  /** The OTHER user in the relationship — never the viewer's own id. */
  userId: z.string().uuid(),
  user: FriendUserSchema,
  status: FriendshipStatusSchema,
  /** Only meaningful when status === 'pending'. Null for accepted/blocked. */
  direction: z.enum(['incoming', 'outgoing']).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Friend = z.infer<typeof FriendSchema>;

export const FriendListResponseSchema = z.array(FriendSchema);

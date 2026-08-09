import { z } from 'zod';

export const NotificationTypeSchema = z.enum([
  'friend_request',
  'friend_accept',
  'server_invite',
  'channel_invite',
  'mention',
  'message',
  'reaction',
  'system',
]);

/** A single notification in the signed-in user's inbox. */
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  isRead: z.boolean(),
  /** Null until the user opens the notification center. */
  readAt: z.string().datetime({ offset: true }).nullable(),
  // { offset: true } — Supabase/PostgREST serializes timestamptz with a
  // "+00:00" suffix, which z.string().datetime() rejects by default.
  createdAt: z.string().datetime({ offset: true }),
  /** Set for `message` notifications so the client can route to the right thread. */
  messageId: z.string().uuid().nullable(),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationType = Notification['type'];

export const NotificationListResponseSchema = z.array(NotificationSchema);
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

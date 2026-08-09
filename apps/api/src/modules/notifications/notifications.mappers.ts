import type { Notification } from '@lobby/shared';
import type { Database } from '../../database/database.types';

export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
    messageId: row.message_id,
  };
}

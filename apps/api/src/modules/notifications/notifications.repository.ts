import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import type { Database } from '../../database/database.types';
import type { NotificationRow } from './notifications.mappers';

export type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

@Injectable()
export class NotificationsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async create(notification: NotificationInsert): Promise<void> {
    const { error } = await this.supabase.client.from('notifications').insert(notification);
    if (error) throw error;
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationRow[]> {
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as NotificationRow[];
  }

  async markAllRead(userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  }
}

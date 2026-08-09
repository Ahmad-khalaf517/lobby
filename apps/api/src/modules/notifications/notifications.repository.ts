import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import type { Database } from '../../database/database.types';

export type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

@Injectable()
export class NotificationsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async create(notification: NotificationInsert): Promise<void> {
    const { error } = await this.supabase.client.from('notifications').insert(notification);
    if (error) throw error;
  }
}

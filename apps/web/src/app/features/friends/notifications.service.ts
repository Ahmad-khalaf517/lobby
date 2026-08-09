import { computed, effect, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../auth/services/auth';
import { SupabaseSessionService } from '../../core/supabase/supabase-session.service';
import type { NotificationRow } from '../../core/supabase/database.types';
import { ToastService } from '../../core/toast/toast.service';
import { FriendsService } from './friends.service';

const FRIEND_NOTIFICATION_TYPES = new Set(['friend_request', 'friend_accept']);

/**
 * Listens for friend-request/accept notifications (rows the API writes to
 * `public.notifications`) over Supabase Realtime and surfaces them as a
 * clickable toast, mirroring how DirectMessagesService handles new messages.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly toast = inject(ToastService);
  private readonly friends = inject(FriendsService);

  private readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  private realtimeChannel: RealtimeChannel | null = null;

  constructor() {
    effect(() => {
      const userId = this.currentUserId();
      if (userId) this.subscribe(userId);
      else this.unsubscribe();
    });
  }

  private subscribe(userId: string): void {
    if (this.realtimeChannel) return;

    this.realtimeChannel = this.supabaseSession.client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this.handleNotification(payload.new as NotificationRow),
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(
            `[NotificationsService] Realtime subscription failed (${status}). ` +
              'Check that an RLS SELECT policy exists on notifications for user_id = auth.uid().',
            error,
          );
        }
      });
  }

  private unsubscribe(): void {
    if (this.realtimeChannel) {
      void this.supabaseSession.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private handleNotification(row: NotificationRow): void {
    if (!FRIEND_NOTIFICATION_TYPES.has(row.type)) return;

    // A new/updated request affects the pending + friends lists — refresh them
    // so the Friends page reflects it the moment the toast appears.
    void this.friends.load();

    this.toast.notify(row.body, {
      title: row.title,
      onClick: () => void this.router.navigate(['/app/friends']),
    });
  }
}

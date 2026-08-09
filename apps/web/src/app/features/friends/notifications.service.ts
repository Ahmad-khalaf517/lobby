import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { NotificationListResponseSchema, type Notification } from '@lobby/shared';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/services/auth';
import { SupabaseSessionService } from '../../core/supabase/supabase-session.service';
import type { NotificationRow } from '../../core/supabase/database.types';
import { FriendsService } from './friends.service';

const FRIEND_NOTIFICATION_TYPES = new Set(['friend_request', 'friend_accept']);

/**
 * The signed-in user's notification inbox (the bell dropdown).
 *
 * The list is loaded from the REST API (`GET /notifications`) and kept live
 * by a Supabase Realtime subscription on `public.notifications`: new rows
 * (friend request/accept, DM notifications) are prepended immediately, which
 * also drives the unread badge. Toast notifications are reserved for new DM
 * messages (handled by DirectMessagesService via `dm_messages` realtime); this
 * service only surfaces friend events in the inbox and keeps the friends lists
 * fresh. The RLS policy on `notifications` (user_id = auth.uid()) scopes
 * delivery to the signed-in user's own notifications.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly friends = inject(FriendsService);
  private readonly ngZone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  private realtimeChannel: RealtimeChannel | null = null;

  private readonly notificationsSignal = signal<Notification[]>([]);
  private readonly loadingSignal = signal(false);

  readonly notifications = this.notificationsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);

  constructor() {
    effect(() => {
      const userId = this.currentUserId();
      if (userId) this.subscribe(userId);
      else this.unsubscribe();
    });
  }

  private subscribe(userId: string): void {
    if (this.realtimeChannel) return;
    void this.load();

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
        (payload) => this.ngZone.run(() => this.handleNotification(payload.new as NotificationRow)),
      )
      .subscribe();
  }

  private unsubscribe(): void {
    if (this.realtimeChannel) {
      void this.supabaseSession.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.notificationsSignal.set([]);
  }

  /** Refresh the inbox from the API (newest first). */
  async load(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const response = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/notifications`));
      this.notificationsSignal.set(NotificationListResponseSchema.parse(response));
    } catch {
      // Keep whatever list we have; the next load or live event will retry.
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Mark every unread notification as read (called when the panel opens). */
  async markAllRead(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/notifications/read-all`, {}));
      this.notificationsSignal.update((list) =>
        list.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: new Date().toISOString() })),
      );
    } catch {
      // Best-effort — the next panel open will retry.
    }
  }

  private handleNotification(row: NotificationRow): void {
    const notification = notificationFromRow(row);
    this.notificationsSignal.update((list) => [
      notification,
      ...list.filter((existing) => existing.id !== notification.id),
    ]);

    if (!FRIEND_NOTIFICATION_TYPES.has(row.type)) return;

    // A new/updated request affects the pending + friends lists — refresh them
    // so the Friends page reflects it the moment it lands.
    void this.friends.load();
  }
}

function notificationFromRow(row: NotificationRow): Notification {
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

import { computed, effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { SupabaseSessionService } from '../../core/supabase/supabase-session.service';
import type { NotificationRow } from '../../core/supabase/database.types';
import { SessionScopeService } from '../../core/session-scope.service';
import { ToastService } from '../../core/toast/toast.service';
import { AuthService } from '../auth/services/auth';
import { FriendsService } from './friends.service';

const FRIEND_NOTIFICATION_TYPES = new Set(['friend_request', 'friend_accept']);

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseSessionService);
  private readonly toast = inject(ToastService);
  private readonly friends = inject(FriendsService);
  private readonly ngZone = inject(NgZone);
  private readonly sessionScope = inject(SessionScopeService);

  private readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  private readonly notificationsSignal = signal<NotificationRow[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private realtimeChannel: RealtimeChannel | null = null;

  readonly notifications = this.notificationsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly unreadCount = computed(
    () => this.notificationsSignal().filter((notification) => !notification.is_read).length,
  );

  constructor() {
    this.sessionScope.registerCleanup(() => this.unsubscribe());
    effect(() => {
      const userId = this.currentUserId();
      if (userId) {
        void this.load();
        this.subscribe(userId);
      } else {
        void this.unsubscribe();
      }
    });
  }

  async load(): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;
    const scope = this.sessionScope.capture();
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!this.sessionScope.isCurrent(scope)) return;
    if (error) this.errorSignal.set('Could not load notifications.');
    else this.notificationsSignal.set(data ?? []);
    this.loadingSignal.set(false);
  }

  async markRead(id: string): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    this.notificationsSignal.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, is_read: true, read_at: readAt } : row)),
    );
  }

  async markAllRead(): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    this.notificationsSignal.update((rows) =>
      rows.map((row) => ({ ...row, is_read: true, read_at: row.read_at ?? readAt })),
    );
  }

  private subscribe(userId: string): void {
    if (this.realtimeChannel) return;
    this.realtimeChannel = this.supabase.client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this.ngZone.run(() => this.handleInsert(payload.new as NotificationRow)),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this.ngZone.run(() => this.upsert(payload.new as NotificationRow)),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        },
        (payload) =>
          this.ngZone.run(() => {
            const id = (payload.old as { id?: string }).id;
            if (id) this.notificationsSignal.update((rows) => rows.filter((row) => row.id !== id));
          }),
      )
      .subscribe();
  }

  private async unsubscribe(): Promise<void> {
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    if (channel) await this.supabase.client.removeChannel(channel).catch(() => undefined);
    this.notificationsSignal.set([]);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
    this.toast.dismissNotifications();
  }

  private handleInsert(row: NotificationRow): void {
    if (row.user_id !== this.sessionScope.userId()) return;
    this.upsert(row);
    if (FRIEND_NOTIFICATION_TYPES.has(row.type)) void this.friends.load();
    this.toast.notify(row.body, {
      title: row.title,
      onClick: () => {
        void this.markRead(row.id).catch(() => undefined);
        void this.router.navigate([
          FRIEND_NOTIFICATION_TYPES.has(row.type) ? '/app/friends' : '/app',
        ]);
      },
    });
  }

  private upsert(row: NotificationRow): void {
    this.notificationsSignal.update((rows) =>
      [row, ...rows.filter((candidate) => candidate.id !== row.id)].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    );
  }
}

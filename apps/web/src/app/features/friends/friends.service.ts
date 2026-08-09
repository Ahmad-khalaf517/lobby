import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  FriendListResponseSchema,
  UserProfileSchema,
  type Friend as ApiFriend,
  type UserProfile,
} from '@lobby/shared';
import { environment } from '../../../environments/environment';
import { SupabaseSessionService } from '../../core/supabase/supabase-session.service';
import { AuthService } from '../auth/services/auth';
import { personFromProfile } from '../../shared/components/person-avatar/person.util';
import type { BlockedUser, Friend, PendingRequest } from './friends.models';

/**
 * Friends feature state — backed by the friendships REST API.
 *
 * Every list is fetched in a single `load()`, and each mutation call hits the
 * API and then refetches so the UI always reflects server truth. A Supabase
 * Realtime subscription on `friendships` refetches on any change from the
 * other side so lists stay live without an explicit action — the RLS policy
 * only delivers rows where the signed-in user is a participant.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly ngZone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly friendsSignal = signal<Friend[]>([]);
  private readonly pendingIncomingSignal = signal<PendingRequest[]>([]);
  private readonly pendingOutgoingSignal = signal<PendingRequest[]>([]);
  private readonly blockedSignal = signal<BlockedUser[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private loadedOnce = false;
  private realtimeChannel: RealtimeChannel | null = null;

  readonly friends = this.friendsSignal.asReadonly();
  readonly pendingIncoming = this.pendingIncomingSignal.asReadonly();
  readonly pendingOutgoing = this.pendingOutgoingSignal.asReadonly();
  readonly blocked = this.blockedSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly pendingCount = computed(
    () => this.pendingIncoming().length + this.pendingOutgoing().length,
  );

  constructor() {
    // Refetch the lists whenever a friendship row changes for this user
    // (request sent/accepted/cancelled, friend removed, block...). The RLS
    // SELECT policy scopes delivery to rows this user participates in.
    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId) {
        this.subscribeRealtime(userId);
      } else {
        this.unsubscribeRealtime();
      }
    });
  }

  private subscribeRealtime(userId: string): void {
    if (this.realtimeChannel) return;
    this.realtimeChannel = this.supabaseSession.client
      .channel(`friendships:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () =>
        this.ngZone.run(() => void this.load()),
      )
      .subscribe();
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeChannel) {
      void this.supabaseSession.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  /** Fetch the friends, incoming/outgoing requests, and blocked lists. */
  async load(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const [friends, incoming, outgoing, blocked] = await Promise.all([
        this.list('/friendships'),
        this.list('/friendships/requests/incoming'),
        this.list('/friendships/requests/outgoing'),
        this.list('/friendships/blocks'),
      ]);

      this.friendsSignal.set(friends.map(toFriend));
      this.pendingIncomingSignal.set(incoming.map(toPendingRequest));
      this.pendingOutgoingSignal.set(outgoing.map(toPendingRequest));
      this.blockedSignal.set(blocked.map(toBlockedUser));
      this.loadedOnce = true;
    } catch {
      this.errorSignal.set('Could not load your friends.');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Load friendship data once, then no-op on later calls (used by hover popovers). */
  ensureLoaded(): Promise<void> {
    if (this.loadedOnce) {
      return Promise.resolve();
    }
    return this.load();
  }

  /** Whether a user is currently in the accepted friends list. */
  isFriend(userId: string): boolean {
    return this.friends().some((friend) => friend.id === userId);
  }

  /** Whether the current user has blocked this user. */
  isBlocked(userId: string): boolean {
    return this.blocked().some((user) => user.id === userId);
  }

  /** Accept an incoming request by its friendship row id. */
  async accept(friendshipId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}/accept`, {}),
    );
    await this.load();
  }

  /** Reject an incoming request. */
  async reject(friendshipId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}`),
    );
    await this.load();
  }

  /** Cancel an outgoing request. */
  async cancel(friendshipId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}`),
    );
    await this.load();
  }

  /** Unblock a user (`userId` is the other user's id). */
  async unblock(userId: string): Promise<void> {
    await firstValueFrom(this.http.delete<unknown>(`${this.apiUrl}/friendships/blocks/${userId}`));
    await this.load();
  }

  /** Remove a friend by its friendship row id. */
  async removeFriend(friendshipId: string): Promise<void> {
    await firstValueFrom(this.http.delete<unknown>(`${this.apiUrl}/friendships/${friendshipId}`));
    await this.load();
  }

  /** Block a user (`userId` is the other user's id) — moves them to the blocked list. */
  async block(userId: string): Promise<void> {
    await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/friendships/blocks`, { userId }));
    await this.load();
  }

  /** Search the user directory by name / username to find someone to add. */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/users/search`, { params: { q: trimmed } }),
    );
    return UserProfileSchema.array().parse(response);
  }

  /** Send a friend request to a user by their id, then refetch the lists. */
  async sendFriendRequest(addresseeId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/friendships/requests`, { addresseeId }),
    );
    await this.load();
  }

  /** Look up any known person by id (friends + pending + blocked). */
  personById(userId: string): Friend | PendingRequest | BlockedUser | null {
    return (
      [
        ...this.friends(),
        ...this.pendingIncoming(),
        ...this.pendingOutgoing(),
        ...this.blocked(),
      ].find((entry) => entry.id === userId) ?? null
    );
  }

  private async list(path: string): Promise<ApiFriend[]> {
    const response = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}${path}`));
    return FriendListResponseSchema.parse(response);
  }
}

function toFriend(api: ApiFriend): Friend {
  return { ...personFromProfile(api.user), friendshipId: api.friendshipId };
}

function toPendingRequest(api: ApiFriend): PendingRequest {
  return {
    ...personFromProfile(api.user),
    friendshipId: api.friendshipId,
    direction: api.direction ?? 'incoming',
    requestedAt: api.createdAt,
  };
}

function toBlockedUser(api: ApiFriend): BlockedUser {
  return { ...personFromProfile(api.user), blockedAt: api.updatedAt };
}

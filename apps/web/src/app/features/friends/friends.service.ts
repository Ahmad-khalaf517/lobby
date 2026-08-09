import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  FriendListResponseSchema,
  UserProfileSchema,
  type Friend as ApiFriend,
  type UserProfile,
} from '@lobby/shared';
import { environment } from '../../../environments/environment';
import { SessionScopeService, type SessionScope } from '../../core/session-scope.service';
import { personFromProfile } from '../../shared/components/person-avatar/person.util';
import type { BlockedUser, Friend, PendingRequest } from './friends.models';

/**
 * Friends feature state — backed by the friendships REST API.
 *
 * Every list is fetched in a single `load()`, and each mutation call hits the
 * API and then refetches so the UI always reflects server truth.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  private readonly http = inject(HttpClient);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly friendsSignal = signal<Friend[]>([]);
  private readonly pendingIncomingSignal = signal<PendingRequest[]>([]);
  private readonly pendingOutgoingSignal = signal<PendingRequest[]>([]);
  private readonly blockedSignal = signal<BlockedUser[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private loadedOnce = false;

  constructor() {
    this.sessionScope.registerCleanup(() => this.reset());
  }

  readonly friends = this.friendsSignal.asReadonly();
  readonly pendingIncoming = this.pendingIncomingSignal.asReadonly();
  readonly pendingOutgoing = this.pendingOutgoingSignal.asReadonly();
  readonly blocked = this.blockedSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly pendingCount = computed(
    () => this.pendingIncoming().length + this.pendingOutgoing().length,
  );

  /** Fetch the friends, incoming/outgoing requests, and blocked lists. */
  async load(): Promise<void> {
    const scope = this.requireScope();
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const [friends, incoming, outgoing, blocked] = await Promise.all([
        this.list('/friendships'),
        this.list('/friendships/requests/incoming'),
        this.list('/friendships/requests/outgoing'),
        this.list('/friendships/blocks'),
      ]);

      this.assertCurrent(scope);
      this.friendsSignal.set(friends.map(toFriend));
      this.pendingIncomingSignal.set(incoming.map(toPendingRequest));
      this.pendingOutgoingSignal.set(outgoing.map(toPendingRequest));
      this.blockedSignal.set(blocked.map(toBlockedUser));
      this.loadedOnce = true;
    } catch {
      if (this.sessionScope.isCurrent(scope)) {
        this.errorSignal.set('Could not load your friends.');
      }
    } finally {
      if (this.sessionScope.isCurrent(scope)) this.loadingSignal.set(false);
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
    const scope = this.requireScope();
    await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}/accept`, {}),
    );
    this.assertCurrent(scope);
    await this.load();
  }

  /** Reject an incoming request. */
  async reject(friendshipId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}`),
    );
    this.assertCurrent(scope);
    await this.load();
  }

  /** Cancel an outgoing request. */
  async cancel(friendshipId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/friendships/requests/${friendshipId}`),
    );
    this.assertCurrent(scope);
    await this.load();
  }

  /** Unblock a user (`userId` is the other user's id). */
  async unblock(userId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(this.http.delete<unknown>(`${this.apiUrl}/friendships/blocks/${userId}`));
    this.assertCurrent(scope);
    await this.load();
  }

  /** Remove a friend by its friendship row id. */
  async removeFriend(friendshipId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(this.http.delete<unknown>(`${this.apiUrl}/friendships/${friendshipId}`));
    this.assertCurrent(scope);
    await this.load();
  }

  /** Block a user (`userId` is the other user's id) — moves them to the blocked list. */
  async block(userId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/friendships/blocks`, { userId }));
    this.assertCurrent(scope);
    await this.load();
  }

  /** Search the user directory by name / username to find someone to add. */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const scope = this.requireScope();
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/users/search`, { params: { q: trimmed } }),
    );
    this.assertCurrent(scope);
    return UserProfileSchema.array().parse(response);
  }

  /** Send a friend request to a user by their id, then refetch the lists. */
  async sendFriendRequest(addresseeId: string): Promise<void> {
    const scope = this.requireScope();
    await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/friendships/requests`, { addresseeId }),
    );
    this.assertCurrent(scope);
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

  reset(): void {
    this.loadedOnce = false;
    this.friendsSignal.set([]);
    this.pendingIncomingSignal.set([]);
    this.pendingOutgoingSignal.set([]);
    this.blockedSignal.set([]);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
  }

  private requireScope(): SessionScope {
    const scope = this.sessionScope.capture();
    if (!scope.userId) throw new Error('An authenticated account is required.');
    return scope;
  }

  private assertCurrent(scope: SessionScope): void {
    if (!this.sessionScope.isCurrent(scope)) {
      throw new Error('The authenticated account changed before the request completed.');
    }
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

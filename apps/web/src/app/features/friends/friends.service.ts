import { computed, Injectable, signal } from '@angular/core';
import type { Person } from '../../shared/components/person-avatar/person.model';
import { initialsFromName } from '../../shared/components/room-chat';
import {
  mockBlocked,
  mockFriends,
  mockPendingIncoming,
  mockPendingOutgoing,
} from './mock-data/friends.mock';
import type { BlockedUser, Friend, PendingRequest } from './friends.models';

/**
 * Friends feature state — local, in-memory mock of the friendships table.
 *
 * Every method mutates signals only; there is no network I/O. When the backend
 * ships, swap each method body for an HTTP call and keep the exact same
 * public surface so the Friends page doesn't change.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  private readonly friendsSignal = signal<Friend[]>(mockFriends);
  private readonly pendingIncomingSignal = signal<PendingRequest[]>(mockPendingIncoming);
  private readonly pendingOutgoingSignal = signal<PendingRequest[]>(mockPendingOutgoing);
  private readonly blockedSignal = signal<BlockedUser[]>(mockBlocked);

  readonly friends = this.friendsSignal.asReadonly();
  readonly pendingIncoming = this.pendingIncomingSignal.asReadonly();
  readonly pendingOutgoing = this.pendingOutgoingSignal.asReadonly();
  readonly blocked = this.blockedSignal.asReadonly();

  readonly pendingCount = computed(
    () => this.pendingIncoming().length + this.pendingOutgoing().length,
  );

  /** Accept an incoming request: moves it into the friends list. */
  accept(requestId: string): void {
    const request = this.pendingIncomingSignal().find((entry) => entry.id === requestId);
    if (!request) {
      return;
    }
    const friend: Friend = {
      id: request.id,
      name: request.name,
      initials: request.initials,
      color: request.color,
      textColor: request.textColor,
      status: request.status,
      lastSeen: request.lastSeen,
    };
    this.pendingIncomingSignal.update((list) => list.filter((entry) => entry.id !== requestId));
    this.friendsSignal.update((list) => [friend, ...list]);
  }

  /** Reject an incoming request: removes it. */
  reject(requestId: string): void {
    this.pendingIncomingSignal.update((list) => list.filter((entry) => entry.id !== requestId));
  }

  /** Cancel an outgoing request: removes it. */
  cancel(requestId: string): void {
    this.pendingOutgoingSignal.update((list) => list.filter((entry) => entry.id !== requestId));
  }

  /** Unblock a user: removes them from the blocked list. */
  unblock(userId: string): void {
    this.blockedSignal.update((list) => list.filter((entry) => entry.id !== userId));
  }

  /** Remove a friend from the friends list (via the row's more-menu). */
  removeFriend(friendId: string): void {
    this.friendsSignal.update((list) => list.filter((entry) => entry.id !== friendId));
  }

  /**
   * Send a friend request for a typed username: adds it to the outgoing list.
   * Returns the created request (or null for a blank name) so the page can show
   * a confirmation.
   */
  sendFriendRequest(username: string): PendingRequest | null {
    const name = username.trim();
    if (!name) {
      return null;
    }

    const existing = [...this.friends(), ...this.pendingIncoming(), ...this.pendingOutgoing()].find(
      (entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );

    const request: PendingRequest = existing
      ? {
          ...existing,
          direction: 'outgoing',
          requestedAt: new Date().toISOString(),
        }
      : {
          id: `user-${Date.now()}`,
          name,
          initials: initialsFromName(name),
          direction: 'outgoing',
          requestedAt: new Date().toISOString(),
        };

    this.pendingOutgoingSignal.update((list) => [request, ...list]);
    return request;
  }

  /** Look up any known person by id (friends + pending + blocked). */
  personById(userId: string): Person | null {
    return (
      [
        ...this.friends(),
        ...this.pendingIncoming(),
        ...this.pendingOutgoing(),
        ...this.blocked(),
      ].find((entry) => entry.id === userId) ?? null
    );
  }
}

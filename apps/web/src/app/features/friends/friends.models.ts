import type { Person } from '../../shared/components/person-avatar/person.model';

/**
 * Friends + requests + blocked domain models. These map 1:1 onto the backend
 * `friendships` rows (status: pending / accepted / blocked) returned by the
 * friendships REST API. `Person.id` is always the OTHER user's id — never the
 * viewer's.
 */

/** An accepted friend (status = accepted). */
export interface Friend extends Person {
  /** The friendship row id — used for DELETE /friendships/:friendshipId. */
  friendshipId: string;
}

/** A pending friend request (status = pending), from the requester's or addressee's point of view. */
export interface PendingRequest extends Person {
  /** The friendship row id — used for accept / reject / cancel. */
  friendshipId: string;
  direction: 'incoming' | 'outgoing';
  /** ISO timestamp of when the request was sent. */
  requestedAt?: string;
}

/** A blocked user (status = blocked). `id` is the blocked user's id. */
export interface BlockedUser extends Person {
  /** ISO timestamp of when the user was blocked. */
  blockedAt?: string;
}

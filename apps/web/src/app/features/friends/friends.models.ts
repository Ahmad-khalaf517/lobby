import type { Person } from '../../shared/components/person-avatar/person.model';

/**
 * Friends + requests + blocked domain models. These map 1:1 onto the backend
 * `friendships` table rows (status: pending / accepted / blocked) so swapping
 * the mock data for real API responses later only touches the service layer.
 */

/** An accepted friend (status = accepted). */
export type Friend = Person;

/** A pending friend request (status = pending), from the requester's or addressee's point of view. */
export interface PendingRequest extends Person {
  direction: 'incoming' | 'outgoing';
  /** ISO timestamp of when the request was sent. */
  requestedAt?: string;
}

/** A blocked user (status = blocked). */
export interface BlockedUser extends Person {
  /** ISO timestamp of when the user was blocked. */
  blockedAt?: string;
}

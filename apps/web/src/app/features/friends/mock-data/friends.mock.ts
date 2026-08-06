import type { Person } from '../../../shared/components/person-avatar/person.model';
import type { BlockedUser, Friend, PendingRequest } from '../friends.models';

/**
 * Mock data for the friends feature.
 *
 * Everything here is a static, in-memory stand-in for the backend
 * `friendships` table + user directory. Replace these arrays with real API
 * responses inside `FriendsService` when the backend ships — nothing in the
 * components needs to change.
 */

/** The signed-in user, used as the requester / "You" identity in local state. */
export const CURRENT_USER: Person = {
  id: 'user-mohammad',
  name: 'Mohammad',
  initials: 'MH',
  color: '#7c5cfc',
  textColor: '#0b0d13',
};

/** Accepted friends (All friends tab). */
export const mockFriends: Friend[] = [
  {
    id: 'user-nada',
    name: 'Nada',
    initials: 'NA',
    color: '#10b981',
    status: 'online',
  },
  {
    id: 'user-youssef',
    name: 'Youssef',
    initials: 'YA',
    color: '#fb923c',
    status: 'offline',
    lastSeen: '2h ago',
  },
  {
    id: 'user-hana',
    name: 'Hana',
    initials: 'HA',
    color: '#14b8a6',
    status: 'online',
  },
  {
    id: 'user-omar',
    name: 'Omar',
    initials: 'OM',
    color: '#f59e0b',
    status: 'online',
  },
  {
    id: 'user-salma',
    name: 'Salma',
    initials: 'SL',
    color: '#f43f5e',
    status: 'offline',
    lastSeen: '1d ago',
  },
  {
    id: 'user-ziad',
    name: 'Ziad',
    initials: 'ZI',
    color: '#6366f1',
    status: 'offline',
    lastSeen: 'yesterday',
  },
  {
    id: 'user-tarek',
    name: 'Tarek',
    initials: 'TR',
    color: '#84cc16',
    status: 'online',
  },
  {
    id: 'user-mona',
    name: 'Mona',
    initials: 'MO',
    color: '#d946ef',
    status: 'offline',
    lastSeen: '5h ago',
  },
];

/** Pending requests sent to me (Accept / Reject). */
export const mockPendingIncoming: PendingRequest[] = [
  {
    id: 'user-lina',
    name: 'Lina',
    initials: 'LI',
    color: '#f472b6',
    direction: 'incoming',
    requestedAt: '2026-08-04T18:20:00.000Z',
  },
  {
    id: 'user-farah',
    name: 'Farah',
    initials: 'FA',
    color: '#22d3ee',
    direction: 'incoming',
    requestedAt: '2026-08-05T09:05:00.000Z',
  },
];

/** Pending requests I sent (Cancel). */
export const mockPendingOutgoing: PendingRequest[] = [
  {
    id: 'user-rania',
    name: 'Rania',
    initials: 'RA',
    color: '#38bdf8',
    direction: 'outgoing',
    requestedAt: '2026-08-03T12:40:00.000Z',
  },
];

/** Blocked users. */
export const mockBlocked: BlockedUser[] = [
  {
    id: 'user-karim',
    name: 'Karim',
    initials: 'KM',
    color: '#3f3f46',
    textColor: '#d4d4d8',
    status: 'offline',
    blockedAt: '2026-07-28T15:10:00.000Z',
  },
];

import type { Friend, Friendship, FriendshipStatus } from '@lobby/shared';
import type { Database } from '../../database/database.types';
import { toUserProfile } from '../users/users.mappers';

export type FriendshipRow = Database['public']['Tables']['friendships']['Row'];
export type UserRow = Database['public']['Tables']['users']['Row'];

export function toFriendship(row: FriendshipRow): Friendship {
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status as FriendshipStatus,
    blockedBy: row.blocked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps a raw row into the viewer-relative `Friend` shape: resolves which
 * side of the row is "the other person", attaches their profile, and for
 * pending rows whether the request is incoming or outgoing.
 */
export function toFriend(row: FriendshipRow, viewerId: string, user: UserRow): Friend {
  const isViewerRequester = row.requester_id === viewerId;
  const otherUserId = isViewerRequester ? row.addressee_id : row.requester_id;

  const direction: Friend['direction'] =
    row.status === 'pending' ? (isViewerRequester ? 'outgoing' : 'incoming') : null;

  return {
    friendshipId: row.id,
    userId: otherUserId,
    user: toUserProfile(user),
    status: row.status as FriendshipStatus,
    direction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

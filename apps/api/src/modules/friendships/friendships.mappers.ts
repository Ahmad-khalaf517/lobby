import type { Friend, Friendship, FriendshipStatus } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type FriendshipRow = Database['public']['Tables']['friendships']['Row'];

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
 * side of the row is "the other person" and, for pending rows, whether
 * the request is incoming or outgoing from the viewer's point of view.
 */
export function toFriend(row: FriendshipRow, viewerId: string): Friend {
  const isViewerRequester = row.requester_id === viewerId;
  const otherUserId = isViewerRequester ? row.addressee_id : row.requester_id;

  const direction: Friend['direction'] =
    row.status === 'pending' ? (isViewerRequester ? 'outgoing' : 'incoming') : null;

  return {
    friendshipId: row.id,
    userId: otherUserId,
    status: row.status as FriendshipStatus,
    direction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const toFriendList = (rows: FriendshipRow[], viewerId: string): Friend[] =>
  rows.map((row) => toFriend(row, viewerId));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Friend, Friendship } from '@lobby/shared';
import type { FriendshipRow } from './friendships.mappers';
import { toFriend, toFriendship } from './friendships.mappers';
import { FriendshipsRepository } from './friendships.repository';

@Injectable()
export class FriendshipsService {
  constructor(private readonly repo: FriendshipsRepository) {}

  /** Joins the "other user" profile onto each relationship row. */
  private async toFriendList(rows: FriendshipRow[], viewerId: string): Promise<Friend[]> {
    const otherUserIds = [
      ...new Set(
        rows.map((row) => (row.requester_id === viewerId ? row.addressee_id : row.requester_id)),
      ),
    ];

    const users = await this.repo.findUsersByIds(otherUserIds);
    const usersById = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => {
      const otherUserId = row.requester_id === viewerId ? row.addressee_id : row.requester_id;
      const user = usersById.get(otherUserId);
      if (!user) {
        // Can't happen while the FK cascades on user delete; guards a corrupted row.
        throw new NotFoundException(`User ${otherUserId} not found`);
      }
      return toFriend(row, viewerId, user);
    });
  }

  // -------------------------------------------------------------------
  // Sending a request
  // -------------------------------------------------------------------

  async sendFriendRequest(requesterId: string, addresseeId: string): Promise<Friendship> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('You cannot send a friend request to yourself.');
    }

    const existing = await this.repo.findPairwise(requesterId, addresseeId);

    if (!existing) {
      const created = await this.repo.createRequest(requesterId, addresseeId);
      return toFriendship(created);
    }

    if (existing.status === 'accepted') {
      throw new ConflictException('You are already friends with this user.');
    }

    if (existing.status === 'blocked') {
      // Deliberately generic — don't reveal which side blocked which.
      throw new ForbiddenException('Unable to send a friend request to this user.');
    }

    // existing.status === 'pending'
    if (existing.requester_id === requesterId) {
      throw new ConflictException('A friend request is already pending.');
    }

    // The other user already sent *this* user a request — sending one back
    // is treated as accepting theirs, so crossed requests become friends.
    const accepted = await this.repo.updateStatus(existing.id, 'accepted');
    return toFriendship(accepted);
  }

  // -------------------------------------------------------------------
  // Responding to a request
  // -------------------------------------------------------------------

  async acceptFriendRequest(userId: string, friendshipId: string): Promise<Friendship> {
    const row = await this.repo.findById(friendshipId);
    if (!row) throw new NotFoundException('Friend request not found.');
    if (row.status !== 'pending') {
      throw new ConflictException('This friend request is no longer pending.');
    }
    if (row.addressee_id !== userId) {
      throw new ForbiddenException('You cannot accept a request that was not sent to you.');
    }

    const updated = await this.repo.updateStatus(friendshipId, 'accepted');
    return toFriendship(updated);
  }

  /**
   * Covers both "decline an incoming request" and "cancel an outgoing one" —
   * either participant on a pending row can remove it.
   */
  async removePendingRequest(userId: string, friendshipId: string): Promise<void> {
    const row = await this.repo.findById(friendshipId);
    if (!row) throw new NotFoundException('Friend request not found.');
    if (row.status !== 'pending') {
      throw new ConflictException('This friend request is no longer pending.');
    }
    if (row.requester_id !== userId && row.addressee_id !== userId) {
      throw new ForbiddenException('You are not part of this friend request.');
    }

    await this.repo.delete(friendshipId);
  }

  // -------------------------------------------------------------------
  // Removing an existing friendship
  // -------------------------------------------------------------------

  async removeFriend(userId: string, friendshipId: string): Promise<void> {
    const row = await this.repo.findById(friendshipId);
    if (!row) throw new NotFoundException('Friendship not found.');
    if (row.status !== 'accepted') {
      throw new ConflictException('You are not friends with this user.');
    }
    if (row.requester_id !== userId && row.addressee_id !== userId) {
      throw new ForbiddenException('You are not part of this friendship.');
    }

    await this.repo.delete(friendshipId);
  }

  // -------------------------------------------------------------------
  // Blocking
  // -------------------------------------------------------------------

  async blockUser(blockerId: string, targetUserId: string): Promise<Friendship> {
    if (blockerId === targetUserId) {
      throw new BadRequestException('You cannot block yourself.');
    }

    const existing = await this.repo.findPairwise(blockerId, targetUserId);

    if (!existing) {
      const created = await this.repo.createBlock(blockerId, targetUserId);
      return toFriendship(created);
    }

    if (existing.status === 'blocked' && existing.blocked_by === blockerId) {
      // Already blocked by this same user — idempotent, just return it.
      return toFriendship(existing);
    }

    // pending, accepted, or blocked-by-the-other-party: blocking now
    // overrides the prior state.
    const updated = await this.repo.updateStatus(existing.id, 'blocked', blockerId);
    return toFriendship(updated);
  }

  async unblockUser(userId: string, targetUserId: string): Promise<void> {
    const existing = await this.repo.findPairwise(userId, targetUserId);
    if (!existing || existing.status !== 'blocked') {
      throw new NotFoundException('No active block found for this user.');
    }
    if (existing.blocked_by !== userId) {
      // Only the person who blocked can lift it.
      throw new ForbiddenException('You did not block this user.');
    }

    // Deleting rather than reverting: there's no reliable previous state to
    // restore to, so unblocking returns the pair to a clean slate.
    await this.repo.delete(existing.id);
  }

  // -------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------

  async listFriends(userId: string): Promise<Friend[]> {
    const rows = await this.repo.listForUser(userId, 'accepted');
    return this.toFriendList(rows, userId);
  }

  async listIncomingRequests(userId: string): Promise<Friend[]> {
    const rows = await this.repo.listIncomingRequests(userId);
    return this.toFriendList(rows, userId);
  }

  async listOutgoingRequests(userId: string): Promise<Friend[]> {
    const rows = await this.repo.listOutgoingRequests(userId);
    return this.toFriendList(rows, userId);
  }

  async listBlockedUsers(userId: string): Promise<Friend[]> {
    const rows = await this.repo.listBlockedByUser(userId);
    return this.toFriendList(rows, userId);
  }

  /** True if either user has blocked the other — for DMs/invites to enforce. */
  async isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
    const row = await this.repo.findPairwise(userAId, userBId);
    return row?.status === 'blocked';
  }

  async areFriends(userAId: string, userBId: string): Promise<boolean> {
    const row = await this.repo.findPairwise(userAId, userBId);
    return row?.status === 'accepted';
  }
}

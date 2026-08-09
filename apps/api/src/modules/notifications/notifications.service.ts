import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly repo: NotificationsRepository) {}

  /** A friend request was sent — notify the addressee. */
  async notifyFriendRequestReceived(addresseeId: string, requesterName: string): Promise<void> {
    await this.safeCreate({
      user_id: addresseeId,
      type: 'friend_request',
      title: 'New friend request',
      body: `${requesterName} wants to be friends.`,
    });
  }

  /** A friend request was accepted — notify the original requester. */
  async notifyFriendRequestAccepted(requesterId: string, accepterName: string): Promise<void> {
    await this.safeCreate({
      user_id: requesterId,
      type: 'friend_accept',
      title: 'Friend request accepted',
      body: `${accepterName} accepted your friend request.`,
    });
  }

  /**
   * Notifications are a side effect of the real action (sending/accepting a
   * request) — a failure here shouldn't fail that action, just get logged.
   */
  private async safeCreate(notification: Parameters<NotificationsRepository['create']>[0]) {
    try {
      await this.repo.create(notification);
    } catch (error) {
      this.logger.warn(`Failed to create notification: ${(error as Error).message}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { Notification } from '@lobby/shared';
import { NotificationsRepository } from './notifications.repository';
import { toNotification } from './notifications.mappers';

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

  /** A DM message arrived — notify the recipient so it shows in their inbox. */
  async notifyDmMessage(
    recipientId: string,
    senderName: string,
    messageBody: string,
  ): Promise<void> {
    await this.safeCreate({
      user_id: recipientId,
      type: 'message',
      title: `New message from ${senderName}`,
      body: messageBody,
      // message_id intentionally left null — the FK points at the channel
      // `messages` table, so a DM message id would violate it.
    });
  }

  /** The signed-in user's notifications, newest first. */
  async listForUser(userId: string): Promise<Notification[]> {
    const rows = await this.repo.listForUser(userId);
    return rows.map(toNotification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.markAllRead(userId);
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

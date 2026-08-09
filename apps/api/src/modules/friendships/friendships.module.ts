import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsRepository } from './friendships.repository';
import { FriendshipsService } from './friendships.service';

@Module({
  imports: [DatabaseModule, UsersModule, NotificationsModule],
  controllers: [FriendshipsController],
  providers: [FriendshipsRepository, FriendshipsService],
  exports: [FriendshipsService], // so DMs/invites can call isBlockedEitherWay/areFriends later
})
export class FriendshipsModule {}

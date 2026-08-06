import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsRepository } from './friendships.repository';
import { FriendshipsService } from './friendships.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FriendshipsController],
  providers: [FriendshipsRepository, FriendshipsService],
  exports: [FriendshipsService], // so DMs/invites can call isBlockedEitherWay/areFriends later
})
export class FriendshipsModule {}

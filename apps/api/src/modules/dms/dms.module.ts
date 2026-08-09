import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { DmsController } from './dms.controller';
import { DmsRepository } from './dms.repository';
import { DmsService } from './dms.service';

@Module({
  imports: [DatabaseModule, UsersModule, FriendshipsModule, NotificationsModule],
  controllers: [DmsController],
  providers: [DmsRepository, DmsService],
  exports: [DmsService],
})
export class DmsModule {}

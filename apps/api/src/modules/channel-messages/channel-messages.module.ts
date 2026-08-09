import { Module } from '@nestjs/common';
import { ChannelModule } from '../channels/channel.module';
import { DatabaseModule } from '../database/database.module';
import { ServerMembersModule } from '../server-members/server-members.module';
import { UsersModule } from '../users/users.module';
import { ChannelMessagesController } from './channel-messages.controller';
import { ChannelMessagesRepository } from './channel-messages.repository';
import { ChannelMessagesService } from './channel-messages.service';

@Module({
  imports: [DatabaseModule, UsersModule, ServerMembersModule, ChannelModule],
  controllers: [ChannelMessagesController],
  providers: [ChannelMessagesRepository, ChannelMessagesService],
  exports: [ChannelMessagesService],
})
export class ChannelMessagesModule {}

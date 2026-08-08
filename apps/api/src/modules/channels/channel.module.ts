import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChannelsRepository } from './channels.repository';
import { ChannelService } from './channel.service';

@Module({
  imports: [DatabaseModule],
  providers: [ChannelsRepository, ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}

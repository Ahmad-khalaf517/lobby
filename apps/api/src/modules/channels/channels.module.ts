import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChannelsController],
  providers: [ChannelsRepository, ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}

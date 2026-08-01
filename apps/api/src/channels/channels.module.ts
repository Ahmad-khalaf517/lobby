import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChannelsController } from './channels.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ChannelsController],
})
export class ChannelsModule {}

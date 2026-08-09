import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { GuestChannelsController } from './guest-channels.controller';
import { GuestChannelsRepository } from './guest-channels.repository';
import { GuestChannelsService } from './guest-channels.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GuestChannelsController],
  providers: [GuestChannelsRepository, GuestChannelsService],
})
export class GuestChannelsModule {}

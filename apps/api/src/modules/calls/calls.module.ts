import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChannelsModule } from '../channels/channels.module.js';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';

@Module({
  imports: [ConfigModule, ChannelsModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}

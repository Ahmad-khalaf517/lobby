import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';

@Module({
  imports: [ConfigModule, AuthModule, DatabaseModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}

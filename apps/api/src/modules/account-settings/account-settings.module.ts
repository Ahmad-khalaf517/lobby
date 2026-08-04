import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsRepository } from './account-settings.repository';
import { AccountSettingsService } from './account-settings.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AccountSettingsController],
  providers: [AccountSettingsRepository, AccountSettingsService],
})
export class AccountSettingsModule {}

import { Injectable } from '@nestjs/common';
import type { AccountSettings, UpdateAccountSettingsRequest } from '@lobby/shared';
import { AccountSettingsRepository } from './account-settings.repository';

@Injectable()
export class AccountSettingsService {
  constructor(private readonly accountSettingsRepository: AccountSettingsRepository) {}

  findSettings(userId: string): Promise<AccountSettings> {
    return this.accountSettingsRepository.findSettings(userId);
  }

  updateSettings(userId: string, payload: UpdateAccountSettingsRequest): Promise<AccountSettings> {
    return this.accountSettingsRepository.updateSettings(userId, payload);
  }
}

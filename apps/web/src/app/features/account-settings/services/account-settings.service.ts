import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AccountSettings,
  AccountSettingsSchema,
  UpdateAccountSettingsRequest,
} from '@lobby/shared';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AccountSettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  async getSettings(userId: string): Promise<AccountSettings> {
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/users/${userId}/account-settings`),
    );
    return AccountSettingsSchema.parse(response);
  }

  async updateSettings(
    userId: string,
    changes: UpdateAccountSettingsRequest,
  ): Promise<AccountSettings> {
    const response = await firstValueFrom(
      this.http.patch<unknown>(`${this.apiUrl}/users/${userId}/account-settings`, changes),
    );
    return AccountSettingsSchema.parse(response);
  }
}

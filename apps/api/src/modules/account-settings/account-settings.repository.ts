import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccountSettings, UpdateAccountSettingsRequest } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import {
  toAccountSettings,
  toAccountSettingsInsert,
  toAccountSettingsUpdate,
} from './account-settings.mappers';

@Injectable()
export class AccountSettingsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findSettings(userId: string): Promise<AccountSettings> {
    const { data, error } = await this.supabase.client
      .from('account_settings')
      .select()
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Account settings not found');
    return toAccountSettings(data);
  }

  async updateSettings(
    userId: string,
    payload: UpdateAccountSettingsRequest,
  ): Promise<AccountSettings> {
    const { data: existingSettings, error: existingSettingsError } = await this.supabase.client
      .from('account_settings')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSettingsError) throw existingSettingsError;

    if (existingSettings) {
      const { data, error } = await this.supabase.client
        .from('account_settings')
        .update(toAccountSettingsUpdate(payload))
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return toAccountSettings(data);
    }

    console.log('ahmad');

    const { data, error } = await this.supabase.client
      .from('account_settings')
      .insert(toAccountSettingsInsert(userId, payload))
      .select()
      .single();

    if (error) throw error;
    return toAccountSettings(data);
  }
}

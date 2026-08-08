import { Injectable } from '@nestjs/common';
import type { Database, Json } from '../../database/database.types';
import { SupabaseService } from '../database/supabase.service';

type DefinitionRow = Database['public']['Tables']['account_setting_definitions']['Row'];
type SettingRow = Database['public']['Tables']['account_settings']['Row'];
type SettingUpsert = Database['public']['Tables']['account_settings']['Insert'];

@Injectable()
export class AccountSettingsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** The full active catalog, in the order the UI should render it. */
  async findActiveDefinitions(): Promise<DefinitionRow[]> {
    const { data, error } = await this.supabase.client
      .from('account_setting_definitions')
      .select()
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async findDefinitionsByKeys(settingKeys: string[]): Promise<DefinitionRow[]> {
    if (settingKeys.length === 0) return [];

    const { data, error } = await this.supabase.client
      .from('account_setting_definitions')
      .select()
      .in('setting_key', settingKeys);

    if (error) throw error;
    return data ?? [];
  }

  async findOverridesForUser(userId: string): Promise<SettingRow[]> {
    const { data, error } = await this.supabase.client
      .from('account_settings')
      .select()
      .eq('user_id', userId);

    if (error) throw error;
    return data ?? [];
  }

  /** Upserts every changed setting for a user in a single round trip. */
  async upsertSettings(userId: string, values: Record<string, Json>): Promise<void> {
    const rows: SettingUpsert[] = Object.entries(values).map(([settingKey, value]) => ({
      user_id: userId,
      setting_key: settingKey,
      value,
    }));

    if (rows.length === 0) return;

    const { error } = await this.supabase.client
      .from('account_settings')
      .upsert(rows, { onConflict: 'user_id,setting_key' });

    if (error) throw error;
  }
}

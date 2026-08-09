import type { AccountSetting, AccountSettingOption, AccountSettingValueType } from '@lobby/shared';
import type { Database, Json } from '../../database/database.types';

type DefinitionRow = Database['public']['Tables']['account_setting_definitions']['Row'];
type SettingRow = Database['public']['Tables']['account_settings']['Row'];

/**
 * Merges a definition with the user's override (if any) into the resolved
 * shape the API returns. `overrideValue` is `undefined` when the user has
 * never saved this setting, in which case the definition's default applies.
 */
export function toAccountSetting(
  definition: DefinitionRow,
  overrideValue: Json | undefined,
): AccountSetting {
  return {
    settingKey: definition.setting_key,
    label: definition.label,
    description: definition.description,
    valueType: definition.value_type as AccountSettingValueType,
    options: (definition.options as AccountSettingOption[] | null) ?? null,
    category: definition.category,
    sortOrder: definition.sort_order,
    value: (overrideValue === undefined ? definition.default_value : overrideValue) as
      boolean | string | number,
  };
}

/** Indexes override rows by `setting_key` for quick lookup while merging. */
export function toOverrideMap(rows: SettingRow[]): Map<string, Json> {
  return new Map(rows.map((row) => [row.setting_key, row.value]));
}

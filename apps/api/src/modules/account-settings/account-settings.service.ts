import { BadRequestException, Injectable } from '@nestjs/common';
import type { AccountSetting, UpdateAccountSettingsRequest } from '@lobby/shared';
import type { Database, Json } from '../../database/database.types';
import { AccountSettingsRepository } from './account-settings.repository';
import { toAccountSetting, toOverrideMap } from './account-settings.mappers';

type DefinitionRow = Database['public']['Tables']['account_setting_definitions']['Row'];

@Injectable()
export class AccountSettingsService {
  constructor(private readonly repository: AccountSettingsRepository) {}

  /** The full catalog with no user overrides applied — each value is the definition's default. */
  async getDefinitions(): Promise<AccountSetting[]> {
    const definitions = await this.repository.findActiveDefinitions();
    return definitions.map((definition) => toAccountSetting(definition, undefined));
  }

  /** The full catalog, each entry resolved against the given user's saved overrides. */
  async getSettingsForUser(userId: string): Promise<AccountSetting[]> {
    const [definitions, overrides] = await Promise.all([
      this.repository.findActiveDefinitions(),
      this.repository.findOverridesForUser(userId),
    ]);

    const overrideMap = toOverrideMap(overrides);
    return definitions.map((definition) =>
      toAccountSetting(definition, overrideMap.get(definition.setting_key)),
    );
  }

  async updateSettingsForUser(
    userId: string,
    changes: UpdateAccountSettingsRequest,
  ): Promise<AccountSetting[]> {
    const settingKeys = Object.keys(changes);
    const definitions = await this.repository.findDefinitionsByKeys(settingKeys);
    const definitionsByKey = new Map(definitions.map((d) => [d.setting_key, d]));

    const validatedValues: Record<string, Json> = {};
    for (const settingKey of settingKeys) {
      const definition = definitionsByKey.get(settingKey);
      if (!definition || !definition.is_active) {
        throw new BadRequestException(`Unknown setting: ${settingKey}`);
      }

      const value = changes[settingKey];
      this.assertValueMatchesDefinition(definition, value);
      validatedValues[settingKey] = value as Json;
    }

    await this.repository.upsertSettings(userId, validatedValues);
    return this.getSettingsForUser(userId);
  }

  private assertValueMatchesDefinition(definition: DefinitionRow, value: unknown): void {
    switch (definition.value_type) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`"${definition.setting_key}" expects a boolean value.`);
        }
        return;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new BadRequestException(`"${definition.setting_key}" expects a number value.`);
        }
        return;
      case 'string':
        if (typeof value !== 'string') {
          throw new BadRequestException(`"${definition.setting_key}" expects a string value.`);
        }
        return;
      case 'select': {
        if (typeof value !== 'string') {
          throw new BadRequestException(`"${definition.setting_key}" expects a string value.`);
        }
        const options = (definition.options as { value: string }[] | null) ?? [];
        const allowed = options.map((option) => option.value);
        if (!allowed.includes(value)) {
          throw new BadRequestException(
            `"${definition.setting_key}" must be one of: ${allowed.join(', ')}.`,
          );
        }
        return;
      }
      default:
        throw new BadRequestException(
          `Setting "${definition.setting_key}" has an unsupported type.`,
        );
    }
  }
}

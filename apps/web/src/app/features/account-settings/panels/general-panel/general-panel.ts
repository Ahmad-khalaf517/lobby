import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { AccountSetting, AccountSettingValue, AccountSettings } from '@lobby/shared';
import { ToggleComponent } from '../../../../shared/ui/toggle/toggle.component';

import { AuthService } from '../../../auth/services/auth';
import { AccountSettingsService } from '../../services/account-settings.service';
import { SettingsPopupService } from '../../services/settings-popup.service';

interface SettingsGroup {
  category: string;
  settings: AccountSetting[];
}

@Component({
  selector: 'app-general-panel',
  standalone: true,
  imports: [ToggleComponent],
  templateUrl: './general-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneralPanelComponent {
  private readonly popup = inject(SettingsPopupService);
  private readonly accountSettingsService = inject(AccountSettingsService);
  private readonly auth = inject(AuthService);

  protected readonly settings = signal<AccountSettings | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** setting_key -> in-flight save, so only the control being changed shows a busy state. */
  private readonly savingKeys = signal<ReadonlySet<string>>(new Set());

  protected readonly groups = computed<SettingsGroup[]>(() => {
    const settings = this.settings();
    if (!settings) return [];

    const byCategory = new Map<string, AccountSetting[]>();
    for (const setting of settings) {
      const group = byCategory.get(setting.category);
      if (group) {
        group.push(setting);
      } else {
        byCategory.set(setting.category, [setting]);
      }
    }

    return Array.from(byCategory.entries()).map(([category, groupSettings]) => ({
      category,
      settings: groupSettings,
    }));
  });

  constructor() {
    effect(() => {
      if (this.popup.isOpen() && this.popup.section() === 'general') {
        void this.loadSettings();
      }
    });
  }

  protected categoryLabel(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
  }

  protected isSaving(settingKey: string): boolean {
    return this.savingKeys().has(settingKey);
  }

  protected async onToggle(setting: AccountSetting, nextValue: boolean): Promise<void> {
    await this.saveChange(setting, nextValue);
  }

  protected async onSelectChange(setting: AccountSetting, event: Event): Promise<void> {
    const nextValue = (event.target as HTMLSelectElement).value;
    await this.saveChange(setting, nextValue);
  }

  protected async onTextChange(setting: AccountSetting, event: Event): Promise<void> {
    const raw = (event.target as HTMLInputElement).value;
    const nextValue = setting.valueType === 'number' ? Number(raw) : raw;
    if (setting.valueType === 'number' && Number.isNaN(nextValue as number)) return;
    await this.saveChange(setting, nextValue as AccountSettingValue);
  }

  private async saveChange(setting: AccountSetting, nextValue: AccountSettingValue): Promise<void> {
    const userId = this.auth.user()?.id;
    const previous = this.settings();
    if (!userId || !previous) return;

    this.settings.set(
      previous.map((entry) =>
        entry.settingKey === setting.settingKey ? { ...entry, value: nextValue } : entry,
      ),
    );
    this.errorMessage.set(null);
    this.setSaving(setting.settingKey, true);
    try {
      const updated = await this.accountSettingsService.updateSetting(
        userId,
        setting.settingKey,
        nextValue,
      );
      this.settings.set(updated);
    } catch (error) {
      this.settings.set(previous);
      this.errorMessage.set(this.messageFor(error, 'Could not save that change.'));
    } finally {
      this.setSaving(setting.settingKey, false);
    }
  }

  private setSaving(settingKey: string, isSaving: boolean): void {
    this.savingKeys.update((current) => {
      const next = new Set(current);
      if (isSaving) {
        next.add(settingKey);
      } else {
        next.delete(settingKey);
      }
      return next;
    });
  }

  private async loadSettings(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const settings = await this.accountSettingsService.getSettings(userId);
      this.settings.set(settings);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not load your settings.'));
    } finally {
      this.loading.set(false);
    }
  }

  private messageFor(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}

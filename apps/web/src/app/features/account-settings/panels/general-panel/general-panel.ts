import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { AccountSettings } from '@lobby/shared';
import { ToggleComponent } from '../../../../shared/ui/toggle/toggle.component';

import { AuthService } from '../../../auth/services/auth';
import { AccountSettingsService } from '../../services/account-settings.service';
import { SettingsPopupService } from '../../services/settings-popup.service';

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

  protected readonly savingPush = signal(false);

  protected readonly pushEnabled = computed(
    () => this.settings()?.pushNotificationsEnabled ?? false,
  );

  constructor() {
    effect(() => {
      if (this.popup.isOpen() && this.popup.section() === 'general') {
        void this.loadSettings();
      }
    });
  }

  protected async onPushToggle(nextValue: boolean): Promise<void> {
    const userId = this.auth.user()?.id;
    const previous = this.settings();
    if (!userId || !previous) return;

    this.settings.set({ ...previous, pushNotificationsEnabled: nextValue });
    this.errorMessage.set(null);
    this.savingPush.set(true);
    try {
      const updated = await this.accountSettingsService.updateSettings(userId, {
        pushNotificationsEnabled: nextValue,
      });
      this.settings.set(updated);
    } catch (error) {
      this.settings.set(previous);
      const message = this.messageFor(error, 'Could not save that change.');
      this.errorMessage.set(message);
    } finally {
      this.savingPush.set(false);
    }
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

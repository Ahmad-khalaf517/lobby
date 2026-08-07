import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from '../../auth/services/auth';

export type SettingsSection = 'profile' | 'general' | 'change-password';

@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  private readonly auth = inject(AuthService);

  private readonly openState = signal(false);
  private readonly sectionState = signal<SettingsSection>('profile');

  readonly isOpen = this.openState.asReadonly();
  readonly section = this.sectionState.asReadonly();

  constructor() {
    // Belt-and-suspenders: if a session expires/logs out while the popup
    // happens to be open, force it shut rather than leaving an account
    // settings panel rendered for a now-signed-out user.
    effect(() => {
      if (this.auth.status() !== 'authenticated' && this.openState()) {
        this.openState.set(false);
      }
    });
  }

  /**
   * Opens the settings popup, optionally jumping straight to a section.
   * This component is mounted globally (outside the router), so it isn't
   * covered by `authGuard` — refuse to open for a signed-out user here
   * instead, since every panel behind it needs an authenticated user id.
   */
  open(section: SettingsSection = 'profile'): void {
    if (this.auth.status() !== 'authenticated') return;

    this.sectionState.set(section);
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  goTo(section: SettingsSection): void {
    if (this.auth.status() !== 'authenticated') {
      this.close();
      return;
    }
    this.sectionState.set(section);
  }
}

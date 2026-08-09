import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from '../../auth/services/auth';
import { SessionScopeService } from '../../../core/session-scope.service';

export type SettingsSection = 'general' | 'change-password';

@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  private readonly auth = inject(AuthService);
  private readonly sessionScope = inject(SessionScopeService);

  private readonly openState = signal(false);
  private readonly sectionState = signal<SettingsSection>('general');

  readonly isOpen = this.openState.asReadonly();
  readonly section = this.sectionState.asReadonly();

  constructor() {
    this.sessionScope.registerCleanup(() => this.reset());
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
  open(section: SettingsSection = 'general'): void {
    if (this.auth.status() !== 'authenticated') return;

    this.sectionState.set(section);
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  private reset(): void {
    this.openState.set(false);
    this.sectionState.set('general');
  }

  goTo(section: SettingsSection): void {
    if (this.auth.status() !== 'authenticated') {
      this.close();
      return;
    }
    this.sectionState.set(section);
  }
}

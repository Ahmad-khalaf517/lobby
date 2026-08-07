import { Injectable, signal } from '@angular/core';

export type SettingsSection = 'profile' | 'general' | 'change-password';

@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  private readonly openState = signal(false);
  private readonly sectionState = signal<SettingsSection>('profile');

  readonly isOpen = this.openState.asReadonly();
  readonly section = this.sectionState.asReadonly();

  /** Opens the settings popup, optionally jumping straight to a section. */
  open(section: SettingsSection = 'profile'): void {
    this.sectionState.set(section);
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  goTo(section: SettingsSection): void {
    this.sectionState.set(section);
  }
}

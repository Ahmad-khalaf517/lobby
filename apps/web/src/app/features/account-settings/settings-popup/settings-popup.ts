import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../auth/services/auth';

import { GeneralPanelComponent } from '../panels/general-panel/general-panel';
import { ProfilePanelComponent } from '../panels/profile-panel/profile-panel';
import { SettingsPopupService, SettingsSection } from '../services/settings-popup.service';
import { ChangePasswordPanelComponent } from '../panels/change-password-panel/change-password-panel';

interface NavItem {
  section: SettingsSection;
  label: string;
}

@Component({
  selector: 'app-settings-popup',
  standalone: true,
  imports: [ProfilePanelComponent, GeneralPanelComponent, ChangePasswordPanelComponent],
  templateUrl: './settings-popup.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPopupComponent {
  private readonly popup = inject(SettingsPopupService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isOpen = this.popup.isOpen;
  protected readonly activeSection = this.popup.section;
  protected readonly isLoggingOut = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  protected readonly navItems: NavItem[] = [
    { section: 'profile', label: 'Profile' },
    { section: 'general', label: 'General' },
    { section: 'change-password', label: 'Change password' },
  ];

  protected navItemClasses(section: SettingsSection): string {
    const base = 'text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-0.5';
    return this.activeSection() === section
      ? `${base} bg-primary text-white`
      : `${base} text-app-muted hover:bg-surface-hover hover:text-app-foreground`;
  }

  protected close(): void {
    this.popup.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected goTo(section: SettingsSection): void {
    this.logoutError.set(null);
    this.popup.goTo(section);
  }

  protected async logout(): Promise<void> {
    if (this.isLoggingOut()) return;

    this.isLoggingOut.set(true);
    this.logoutError.set(null);
    try {
      await this.auth.logout();
      this.close();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.logoutError.set(
        error instanceof Error && error.message
          ? error.message
          : 'Could not sign you out. Please try again.',
      );
    } finally {
      this.isLoggingOut.set(false);
    }
  }
}

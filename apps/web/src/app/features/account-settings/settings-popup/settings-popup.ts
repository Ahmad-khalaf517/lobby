import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../auth/services/auth';

import {
  LobbyIconComponent,
  type LobbyIconName,
} from '../../../shared/ui/icon/lobby-icon.component';
import { GeneralPanelComponent } from '../panels/general-panel/general-panel';
import { SettingsPopupService, SettingsSection } from '../services/settings-popup.service';
import { ChangePasswordPanelComponent } from '../panels/change-password-panel/change-password-panel';

interface NavItem {
  section: SettingsSection;
  label: string;
  icon: LobbyIconName;
}

@Component({
  selector: 'app-settings-popup',
  standalone: true,
  imports: [LobbyIconComponent, GeneralPanelComponent, ChangePasswordPanelComponent],
  templateUrl: './settings-popup.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPopupComponent {
  private readonly popup = inject(SettingsPopupService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isOpen = this.popup.isOpen;
  protected readonly activeSection = this.popup.section;

  protected readonly navItems: NavItem[] = [
    { section: 'general', label: 'General', icon: 'settings' },
    { section: 'change-password', label: 'Security', icon: 'lock' },
  ];

  protected navItemClasses(section: SettingsSection): string {
    const base =
      'flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-0.5';
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
    this.popup.goTo(section);
  }
}

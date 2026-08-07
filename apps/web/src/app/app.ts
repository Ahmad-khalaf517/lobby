import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppLoadingService } from './core/loading/app-loading.service';
import { RouteProgressComponent } from './core/loading/route-progress.component';
import { AuthService } from './features/auth/services/auth';
import { ProfilePopupComponent } from './features/profile/profile-popup/profile-popup';
import { ProfilePopupService } from './features/profile/services/profile-popup.service';
import { SettingsPopupComponent } from './features/account-settings/settings-popup/settings-popup';
import { SettingsPopupService } from './features/account-settings/services/settings-popup.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouteProgressComponent, ProfilePopupComponent, SettingsPopupComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly profilePopup = inject(ProfilePopupService);
  private readonly settingsPopup = inject(SettingsPopupService);
  protected readonly loading = inject(AppLoadingService);

  constructor() {
    this.loading.sessionRestorationStarted();
    void this.auth.initialize();
  }

  protected reload(): void {
    this.document.defaultView?.location.reload();
  }

  protected openMyProfile(): void {
    const userId = this.auth.user()?.id;
    if (userId) {
      this.profilePopup.open(userId);
    }
  }
  protected openSettings(): void {
    this.settingsPopup.open('profile');
  }
}

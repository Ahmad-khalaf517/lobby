import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { ChangePasswordPanelComponent } from '../../account-settings/panels/change-password-panel/change-password-panel';
import { GeneralPanelComponent } from '../../account-settings/panels/general-panel/general-panel';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [GeneralPanelComponent, ChangePasswordPanelComponent],
  templateUrl: './settings-stub-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class SettingsStubPage {
  protected readonly section = signal<'general' | 'security'>('general');
}

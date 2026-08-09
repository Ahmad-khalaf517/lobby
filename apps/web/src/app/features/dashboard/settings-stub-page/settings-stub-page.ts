import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Placeholder for /app/settings — profile/account settings UI and API are
 * owned by someone else; this just gives the rail's settings button a real
 * route instead of a 404.
 */
@Component({
  selector: 'app-settings-stub-page',
  standalone: true,
  templateUrl: './settings-stub-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class SettingsStubPage {}

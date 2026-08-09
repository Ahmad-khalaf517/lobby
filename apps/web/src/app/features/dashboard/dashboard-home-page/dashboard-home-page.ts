import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { LoadingStateComponent } from '../../../shared/ui/loading-state/loading-state.component';
import { DashboardStore } from '../services/dashboard.store';

/**
 * Landing content for the bare `/app` route: redirects straight into the
 * user's first server once servers have loaded, or shows a create/join empty
 * state when they have none yet.
 */
@Component({
  selector: 'app-dashboard-home-page',
  standalone: true,
  imports: [LobbyIconComponent, LoadingStateComponent],
  templateUrl: './dashboard-home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class DashboardHomePage {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);
  private redirected = false;

  constructor() {
    effect(() => {
      const servers = this.store.servers();
      if (!this.redirected && !this.store.loading() && servers.length > 0) {
        this.redirected = true;
        void this.router.navigate(['/app/servers', servers[0].id]);
      }
    });
  }
}

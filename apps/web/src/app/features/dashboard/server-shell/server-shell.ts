import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { LoadingStateComponent } from '../../../shared/ui/loading-state/loading-state.component';
import { DashboardStore } from '../services/dashboard.store';
import { ServersService } from '../services/servers.service';

/**
 * Owns just enough server-level state to redirect a bare
 * `/app/servers/:serverId` landing straight into its first channel — the
 * channel tabs/content themselves live in ChannelView, which re-fetches the
 * server for tab data (small duplicate GET, kept simple on purpose).
 */
@Component({
  selector: 'app-server-shell',
  standalone: true,
  imports: [RouterOutlet, LoadingStateComponent],
  templateUrl: './server-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ServerShell {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly serversService = inject(ServersService);
  private readonly dashboardStore = inject(DashboardStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const serverId = paramMap.get('serverId');
      if (serverId) void this.redirectToFirstChannelIfBare(serverId);
    });
  }

  private async redirectToFirstChannelIfBare(serverId: string): Promise<void> {
    if (this.route.snapshot.firstChild !== null) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const server = await this.serversService.getServer(serverId);
      this.dashboardStore.cacheChannels(server.id, server.channels);
      if (server.channels.length > 0) {
        await this.router.navigate(['/app/servers', server.id, 'channels', server.channels[0].id], {
          replaceUrl: true,
        });
      }
    } finally {
      this.loading.set(false);
    }
  }
}

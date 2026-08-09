import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Server } from '@lobby/shared';

import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { DashboardStore } from '../services/dashboard.store';

type JoinLinkStatus = 'joining' | 'error';

/**
 * Route `/app/join/:inviteCode` — the shareable-link counterpart to the
 * type-a-code <app-join-server-modal>. Joins automatically on load, then
 * lands the user straight in the space (same target the modal navigates to).
 */
@Component({
  selector: 'app-join-link-page',
  standalone: true,
  imports: [RouterLink, LobbyIconComponent],
  templateUrl: './join-link-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class JoinLinkPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(DashboardStore);

  protected readonly status = signal<JoinLinkStatus>('joining');
  protected readonly server = signal<Server | null>(null);
  private readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';

  constructor() {
    void this.join();
  }

  protected async join(): Promise<void> {
    this.status.set('joining');
    if (!this.inviteCode.trim()) {
      this.status.set('error');
      return;
    }
    try {
      const server = await this.store.joinServer(this.inviteCode);
      this.server.set(server);
      await this.router.navigate(['/app/servers', server.id]);
    } catch {
      this.status.set('error');
    }
  }
}

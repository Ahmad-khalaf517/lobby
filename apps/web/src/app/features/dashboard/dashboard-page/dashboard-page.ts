import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AppHeaderComponent } from '../components/app-header/app-header.component';
import { CreateServerModalComponent } from '../components/create-server-modal/create-server-modal.component';
import { JoinServerModalComponent } from '../components/join-server-modal/join-server-modal.component';
import { ServerRailComponent } from '../components/server-rail/server-rail.component';
import { DashboardStore } from '../services/dashboard.store';
import { SessionScopeService } from '../../../core/session-scope.service';

const SERVER_ID_PATTERN = /\/app\/servers\/([^/]+)/;

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    ServerRailComponent,
    CreateServerModalComponent,
    JoinServerModalComponent,
  ],
  templateUrl: './dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionScope = inject(SessionScopeService);

  protected readonly activeServerId = signal(this.extractServerId(this.router.url));
  protected readonly mobileSidebarOpen = signal(false);

  protected readonly activeServer = computed(
    () => this.store.servers().find((server) => server.id === this.activeServerId()) ?? null,
  );

  constructor() {
    const unregister = this.sessionScope.registerCleanup(() => {
      this.activeServerId.set(null);
      this.mobileSidebarOpen.set(false);
    });
    this.destroyRef.onDestroy(unregister);

    effect(() => {
      if (this.sessionScope.userId()) void this.store.ensureLoaded();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.activeServerId.set(this.extractServerId(event.urlAfterRedirects));
        this.mobileSidebarOpen.set(false);
      });
  }

  protected toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update((value) => !value);
  }

  private extractServerId(url: string): string | null {
    return SERVER_ID_PATTERN.exec(url)?.[1] ?? null;
  }
}

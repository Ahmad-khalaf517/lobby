import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppLoadingService } from './core/loading/app-loading.service';
import { RouteProgressComponent } from './core/loading/route-progress.component';
import { AuthService } from './features/auth/services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouteProgressComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  protected readonly loading = inject(AppLoadingService);

  constructor() {
    this.loading.sessionRestorationStarted();
    void this.auth.initialize();
  }

  protected reload(): void {
    this.document.defaultView?.location.reload();
  }
}

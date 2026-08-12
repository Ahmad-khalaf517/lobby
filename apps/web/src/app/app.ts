import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RouteProgressComponent } from './core/loading/route-progress.component';
import { ToastContainerComponent } from './core/toast/toast-container.component';
import { AuthService } from './features/auth/services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouteProgressComponent, ToastContainerComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);

  constructor() {
    // Session restoration is deliberately background work. Protected routes
    // and identity-dependent guest actions await this same coalesced promise.
    void this.auth.initialize();
  }
}

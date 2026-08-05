import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  RouteConfigLoadEnd,
  RouteConfigLoadStart,
  Router,
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type AppStartupState = 'booting' | 'restoring-session' | 'navigating' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class AppLoadingService {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly startupState = signal<AppStartupState>('booting');
  private readonly navigationLoading = signal(false);
  private initialNavigationSettled = false;

  readonly startup = this.startupState.asReadonly();
  readonly routeLoading = this.navigationLoading.asReadonly();

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (this.initialNavigationSettled) {
          this.navigationLoading.set(true);
        } else {
          this.startupState.set('navigating');
        }
        return;
      }

      if (event instanceof RouteConfigLoadStart) {
        if (this.initialNavigationSettled) {
          this.navigationLoading.set(true);
        }
        return;
      }

      if (event instanceof RouteConfigLoadEnd) {
        // NavigationEnd owns completion so activation work is also represented.
        return;
      }

      if (event instanceof NavigationEnd || event instanceof NavigationSkipped) {
        this.finishNavigation();
        return;
      }

      if (event instanceof NavigationCancel) {
        this.navigationLoading.set(false);

        const replacementNavigationExpected =
          event.code === NavigationCancellationCode.Redirect ||
          event.code === NavigationCancellationCode.SupersededByNewNavigation;

        if (!this.initialNavigationSettled && !replacementNavigationExpected) {
          this.failInitialNavigation();
        }
        return;
      }

      if (event instanceof NavigationError) {
        console.error('Lobby navigation failed.', event.error);
        this.navigationLoading.set(false);

        if (!this.initialNavigationSettled) {
          this.failInitialNavigation();
        }
      }
    });
  }

  sessionRestorationStarted(): void {
    if (this.startupState() === 'booting') {
      this.startupState.set('restoring-session');
    }
  }

  private finishNavigation(): void {
    this.navigationLoading.set(false);

    if (!this.initialNavigationSettled) {
      this.initialNavigationSettled = true;
      this.startupState.set('ready');
    }
  }

  private failInitialNavigation(): void {
    this.initialNavigationSettled = true;
    this.startupState.set('error');
  }
}

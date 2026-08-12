import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AppLoadingService {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly navigationLoading = signal(false);

  readonly routeLoading = this.navigationLoading.asReadonly();

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigationLoading.set(true);
        return;
      }

      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationSkipped ||
        event instanceof NavigationCancel
      ) {
        this.navigationLoading.set(false);
        return;
      }

      if (event instanceof NavigationError) {
        console.error('Lobby navigation failed.', event.error);
        this.navigationLoading.set(false);
      }
    });
  }
}

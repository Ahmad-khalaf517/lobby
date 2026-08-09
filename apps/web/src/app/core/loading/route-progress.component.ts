import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppLoadingService } from './app-loading.service';

@Component({
  selector: 'app-route-progress',
  standalone: true,
  template: `
    <div
      class="route-progress"
      [class.route-progress--active]="loading()"
      [attr.role]="loading() ? 'progressbar' : null"
      [attr.aria-label]="loading() ? 'Loading page' : null"
      [attr.aria-hidden]="loading() ? null : 'true'"
    >
      <span></span>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0 0 auto;
      z-index: 100;
      height: 2px;
      pointer-events: none;
    }

    .route-progress {
      position: absolute;
      inset: 0;
      overflow: hidden;
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 150ms ease,
        visibility 0s linear 150ms;
    }

    .route-progress--active {
      opacity: 1;
      visibility: visible;
      transition:
        opacity 140ms 120ms ease-out,
        visibility 0s linear;
    }

    .route-progress span {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, #7c5cfc 38%, #76d7ed 62%, transparent);
      box-shadow: 0 0 14px rgba(124, 92, 252, 0.72);
      transform: translateX(-70%);
    }

    .route-progress--active span {
      animation: route-progress-travel 1.05s ease-in-out infinite;
    }

    @keyframes route-progress-travel {
      to {
        transform: translateX(70%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .route-progress {
        transition-duration: 1ms;
      }

      .route-progress span {
        transform: none;
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteProgressComponent {
  protected readonly loading = inject(AppLoadingService).routeLoading;
}

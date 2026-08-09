import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LogoComponent } from '../logo/lobby-logo.component';

/**
 * Shared "pulsing logo" loading state used wherever a page is waiting on
 * initial data (dashboard home, server shell, channel view). Replaces a bare
 * spinner with the same calm loading language used on the guest-room page.
 *
 * @example
 * <app-loading-state message="Loading your servers" />
 */
@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [LogoComponent],
  templateUrl: './loading-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 w-full flex-1 items-center justify-center bg-app-background p-6',
  },
})
export class LoadingStateComponent {
  message = input<string>('Loading…');
  logoSize = input<number>(26);
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  LOBBY_BASE_PATH,
  LOBBY_GRADIENT_STOPS,
  LOBBY_LOGO_VIEWBOX,
  LOBBY_SILHOUETTE_PATH,
} from './logo.paths';

/**
 * Static, non-animated Lobby logo.
 *
 * @example
 * <app-lobby-logo />
 * <app-lobby-logo [size]="48" />
 * <app-lobby-logo [size]="96" label="Lobby" />
 * <app-lobby-logo [size]="32" [decorative]="true" />
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  templateUrl: './lobby-logo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'lobby-logo-host',
  },
})
export class LogoComponent {
  /** Rendered width and height, in pixels. Aspect ratio is preserved regardless of size. */
  size = input<number>(48);

  /** Accessible name announced to assistive tech. Ignored when `decorative` is true. */
  label = input<string>('Lobby');

  /** Set to true when the logo is purely decorative (e.g. it sits beside visible text that already names it). */
  decorative = input<boolean>(false);

  protected readonly viewBox = LOBBY_LOGO_VIEWBOX;
  protected readonly silhouettePath = LOBBY_SILHOUETTE_PATH;
  protected readonly basePath = LOBBY_BASE_PATH;
  protected readonly gradientStart = LOBBY_GRADIENT_STOPS.start;
  protected readonly gradientEnd = LOBBY_GRADIENT_STOPS.end;

  /** Unique per-instance gradient id so multiple logos on one page never collide. */
  private static nextId = 0;
  protected readonly gradientId = `lobby-logo-gradient-${LogoComponent.nextId++}`;
}

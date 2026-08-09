import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { TrackPublication } from 'livekit-client';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';

@Component({
  selector: 'app-call-stage',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './call-stage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'flex'",
    '[style.flex]': "'1 1 0%'",
    '[style.minHeight]': "'0'",
    '[style.flexDirection]': "'column'",
  },
})
export class CallStageComponent {
  isLocalSharing = input<boolean>(false);
  sharerName = input<string>('');
  screenShareTrack = input<TrackPublication | null>(null);

  protected readonly expanded = signal(false);

  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly shareVideo = viewChild<ElementRef<HTMLVideoElement>>('shareVideo');

  constructor() {
    effect(() => {
      const element = this.shareVideo()?.nativeElement;
      const track = this.screenShareTrack()?.videoTrack;
      if (!element || !track || typeof document === 'undefined') return;

      track.attach(element);
      return () => track.detach(element);
    });

    if (typeof document !== 'undefined') {
      const onFullscreenChange = (): void => {
        if (document.fullscreenElement === this.stage()?.nativeElement) {
          this.expanded.set(true);
        } else if (document.fullscreenElement === null) {
          this.expanded.set(false);
        }
      };

      const onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.expanded() && document.fullscreenElement === null) {
          this.expanded.set(false);
        }
      };

      document.addEventListener('fullscreenchange', onFullscreenChange);
      document.addEventListener('keydown', onKeydown);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        document.removeEventListener('keydown', onKeydown);
      });
    }
  }

  protected async toggleExpanded(): Promise<void> {
    if (typeof document === 'undefined') return;
    const stage = this.stage()?.nativeElement;
    if (!stage) return;

    if (this.expanded() && document.fullscreenElement === null) {
      this.expanded.set(false);
      return;
    }

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        const requestFullscreen = stage.requestFullscreen;
        if (typeof requestFullscreen !== 'function') {
          this.expanded.set(true);
          return;
        }

        await requestFullscreen.call(stage);
        if (document.fullscreenElement !== stage) this.expanded.set(true);
      }
    } catch {
      // iOS and embedded browsers can reject native fullscreen. Keep the
      // presentation maximized with an in-app fallback instead.
      this.expanded.set(true);
    }
  }
}

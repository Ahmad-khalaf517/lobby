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
        this.expanded.set(document.fullscreenElement === this.stage()?.nativeElement);
      };

      document.addEventListener('fullscreenchange', onFullscreenChange);
      this.destroyRef.onDestroy(() =>
        document.removeEventListener('fullscreenchange', onFullscreenChange),
      );
    }
  }

  protected async toggleExpanded(): Promise<void> {
    if (typeof document === 'undefined') return;
    const stage = this.stage()?.nativeElement;
    if (!stage) return;

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      // The browser may reject fullscreen when it is unavailable or blocked.
    }
  }
}

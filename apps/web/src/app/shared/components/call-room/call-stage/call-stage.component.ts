import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { TrackPublication } from 'livekit-client';

/**
 * Screen-share spotlight: the large centered view of whatever the active
 * sharer is presenting (real LiveKit screen-share track attached to a
 * <video>). Only rendered by the parent while someone is actually sharing —
 * the rest of the time the participant grid fills the stage, so there is no
 * dead "empty share" card in the middle of the call.
 *
 * Presentational — the parent passes the track + share state.
 */
@Component({
  selector: 'app-call-stage',
  standalone: true,
  imports: [],
  templateUrl: './call-stage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'flex'",
    '[style.flex]': "'1 1 0%'",
    '[style.minHeight]': "'0'",
    '[style.padding]': "'1rem'",
    '[style.flexDirection]': "'column'",
  },
})
export class CallStageComponent {
  isLocalSharing = input<boolean>(false);
  sharerName = input<string>('');
  screenShareTrack = input<TrackPublication | null>(null);

  private readonly shareVideo = viewChild<ElementRef<HTMLVideoElement>>('shareVideo');

  constructor() {
    effect(() => {
      const element = this.shareVideo()?.nativeElement;
      const track = this.screenShareTrack()?.videoTrack;
      if (!element || !track || typeof document === 'undefined') {
        return;
      }

      track.attach(element);
      return () => track.detach(element);
    });
  }
}

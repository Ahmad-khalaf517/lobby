import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { TrackPublication } from 'livekit-client';
import { CallIconComponent } from '../../room-chat/call-icon/call-icon.component';

/**
 * Center of the call: a header, then either the active shared-screen view
 * (real LiveKit screen-share track attached to a <video>) or the "share
 * something with the room" empty state with a "Start screen sharing" button.
 *
 * Presentational — the parent passes the track + share state and decides what
 * `(startShare)` means.
 */
@Component({
  selector: 'app-call-stage',
  standalone: true,
  imports: [CallIconComponent],
  templateUrl: './call-stage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallStageComponent {
  isSharingScreen = input<boolean>(false);
  isLocalSharing = input<boolean>(false);
  sharerName = input<string>('');
  screenShareTrack = input<TrackPublication | null>(null);

  /** Emitted when the user clicks "Start screen sharing". */
  readonly startShare = output<void>();

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

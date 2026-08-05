import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { CallIconComponent } from '../../room-chat/call-icon/call-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';
import type { CallParticipant } from '../models/call-participant.model';

/**
 * A single participant tile in the call: attaches the participant's real
 * LiveKit camera track to a <video> (via `track.attach()`), falls back to an
 * <app-chat-avatar> when the camera is off, and overlays name + mic-muted +
 * speaking indicators. The local user's tile gets a highlighted border.
 *
 * Presentational — the parent owns the participants data.
 */
@Component({
  selector: 'app-call-video-tile',
  standalone: true,
  imports: [CallIconComponent, ChatAvatarComponent],
  templateUrl: './call-video-tile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallVideoTileComponent {
  participant = input.required<CallParticipant>();
  isLocal = input<boolean>(false);

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly cameraVisible = computed(
    () => !this.participant().isCameraOff && this.participant().cameraTrack !== null,
  );

  constructor() {
    effect(() => {
      const element = this.videoEl()?.nativeElement;
      const track = this.cameraVisible() ? this.participant().cameraTrack?.videoTrack : null;
      if (!element || !track || typeof document === 'undefined') {
        return;
      }

      track.attach(element);
      return () => track.detach(element);
    });
  }
}

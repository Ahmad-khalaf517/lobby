import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CallIconComponent } from '../../room-chat/call-icon/call-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';

/**
 * Bottom control bar: current user info, mic / camera / screen-share / leave
 * controls (via <app-call-icon>), an "Invite" action and an optional message
 * input slot (`[call-control-input]`). Emits actions only — the parent owns
 * the LiveKit state that drives the `*Enabled`/`*Pending` inputs.
 */
@Component({
  selector: 'app-call-control-bar',
  standalone: true,
  imports: [CallIconComponent, ChatAvatarComponent],
  templateUrl: './call-control-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallControlBarComponent {
  currentUserName = input<string>('');
  enabled = input<boolean>(false);
  micEnabled = input<boolean>(false);
  micPending = input<boolean>(false);
  cameraEnabled = input<boolean>(false);
  screenShareActive = input<boolean>(false);
  screenSharePending = input<boolean>(false);

  readonly toggleMic = output<void>();
  readonly toggleCamera = output<void>();
  readonly toggleScreenShare = output<void>();
  readonly leave = output<void>();
}

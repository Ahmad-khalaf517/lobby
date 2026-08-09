import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';

@Component({
  selector: 'app-call-control-bar',
  standalone: true,
  imports: [LobbyIconComponent, ChatAvatarComponent],
  templateUrl: './call-control-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallControlBarComponent {
  currentUserName = input<string>('');
  enabled = input(false);
  micEnabled = input(false);
  micPending = input(false);
  screenShareActive = input(false);
  screenSharePending = input(false);
  screenShareSupported = input(true);
  screenShareDisabled = input(false);
  screenShareDisabledReason = input<string | null>(null);
  participantCount = input(0);
  chatOpen = input(false);

  readonly toggleMic = output<void>();
  readonly toggleScreenShare = output<void>();
  readonly toggleParticipants = output<void>();
  readonly toggleChat = output<void>();
  readonly leave = output<void>();
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';
import type { CallParticipant } from '../models/call-participant.model';

@Component({
  selector: 'app-call-participants-sidebar',
  standalone: true,
  imports: [LobbyIconComponent, ChatAvatarComponent],
  templateUrl: './call-participants-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.display]': "'contents'" },
})
export class CallParticipantsSidebarComponent {
  participants = input<CallParticipant[]>([]);
  title = input<string>('People');
  emptyText = input<string>('Waiting for participants…');
  showCount = input(true);
  canManage = input(false);

  readonly removeParticipant = output<CallParticipant>();
}

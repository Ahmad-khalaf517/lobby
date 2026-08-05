import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CallIconComponent } from '../../room-chat/call-icon/call-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';
import type { CallParticipant } from '../models/call-participant.model';

/**
 * "In this room" participant list. Presentational: rows are driven entirely by
 * the `participants` input and rendered with the shared <app-chat-avatar>.
 * Reused by both the call room (LiveKit participants) and the guest room
 * (socket presence members mapped onto the same CallParticipant shape).
 */
@Component({
  selector: 'app-call-participants-sidebar',
  standalone: true,
  imports: [CallIconComponent, ChatAvatarComponent],
  templateUrl: './call-participants-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class CallParticipantsSidebarComponent {
  participants = input<CallParticipant[]>([]);
  title = input<string>('In this room');
  emptyText = input<string>('Waiting for participants…');
  showCount = input<boolean>(true);
}

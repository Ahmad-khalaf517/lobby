import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
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

  readonly kickParticipant = output<CallParticipant>();
  readonly blockParticipant = output<CallParticipant>();

  protected readonly openMenuParticipantId = signal<string | null>(null);

  protected toggleManagementMenu(event: MouseEvent, participantId: string): void {
    event.stopPropagation();
    this.openMenuParticipantId.update((current) =>
      current === participantId ? null : participantId,
    );
  }

  protected requestKick(event: MouseEvent, participant: CallParticipant): void {
    event.stopPropagation();
    this.openMenuParticipantId.set(null);
    this.kickParticipant.emit(participant);
  }

  protected requestBlock(event: MouseEvent, participant: CallParticipant): void {
    event.stopPropagation();
    this.openMenuParticipantId.set(null);
    this.blockParticipant.emit(participant);
  }

  @HostListener('document:click')
  protected closeManagementMenu(): void {
    this.openMenuParticipantId.set(null);
  }

  @HostListener('document:keydown.escape')
  protected closeManagementMenuFromKeyboard(): void {
    this.openMenuParticipantId.set(null);
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';
import type { CallParticipant } from '../models/call-participant.model';

@Component({
  selector: 'app-voice-participant-tile',
  standalone: true,
  imports: [LobbyIconComponent, ChatAvatarComponent],
  templateUrl: './voice-participant-tile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceParticipantTileComponent {
  participant = input.required<CallParticipant>();
  compact = input(false);
}

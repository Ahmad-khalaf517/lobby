import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ChatUserStatus } from '../room-chat/models/chat-user.model';
import { ChatAvatarComponent, type ChatAvatarSize, type ChatAvatarShape } from '../room-chat';
import type { Person } from './person.model';

/**
 * Person avatar — a thin wrapper around <app-chat-avatar> that maps a shared
 * `Person` descriptor (name / initials / brand color / status) onto the avatar
 * component's override inputs. Use it for friends rows, DM conversation rows,
 * message author tiles and anywhere a specific person's face is shown.
 *
 * @example
 * <app-person-avatar [person]="friend" />
 * <app-person-avatar [person]="friend" size="sm" />
 * <app-person-avatar [person]="friend" [shape]="'rounded'" [status]="'online'" />
 */
@Component({
  selector: 'app-person-avatar',
  standalone: true,
  imports: [ChatAvatarComponent],
  templateUrl: './person-avatar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonAvatarComponent {
  person = input.required<Person>();

  size = input<ChatAvatarSize>('md');

  shape = input<ChatAvatarShape>('circle');

  /** Override the person's presence dot (falls back to the person's own status). */
  status = input<ChatUserStatus | null>(null);
}

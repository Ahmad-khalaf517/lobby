import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  avatarColor,
  avatarGradient,
  initialsFromName,
} from '../../../../shared/components/room-chat';

export type ServerIconSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Rounded-square server "icon" — deliberately distinct from `app-chat-avatar`
 * (a circle, used for people). Discord-style convention: servers are
 * squircles, users are circles. Reuses chat-avatar's color/initials helpers
 * so a server and its members still feel like one consistent palette.
 */
@Component({
  selector: 'app-server-icon',
  standalone: true,
  template: `
    <span [class]="classes()" [style.background]="background()" [style.color]="textColor()">
      {{ initials() }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ServerIconComponent {
  readonly name = input<string>('?');
  readonly size = input<ServerIconSize>('md');
  readonly active = input(false);

  private readonly sizeClasses: Record<ServerIconSize, string> = {
    xs: 'size-5 rounded-md text-[8px]',
    sm: 'size-6 rounded-lg text-[10px]',
    md: 'size-8 rounded-lg text-[10px]',
    lg: 'size-11 rounded-2xl text-xs',
  };

  protected readonly classes = computed(
    () =>
      `grid shrink-0 place-items-center font-medium transition-[border-radius] hover:rounded-xl ${this.sizeClasses[this.size()]}${this.active() ? ' ring-2 ring-primary/60' : ''}`,
  );

  protected readonly initials = computed(() => initialsFromName(this.name()));
  protected readonly background = computed(() => avatarGradient(this.name(), 0.9, 0.65));
  protected readonly textColor = computed(() => avatarColor(this.name(), 0.98, 96));
}

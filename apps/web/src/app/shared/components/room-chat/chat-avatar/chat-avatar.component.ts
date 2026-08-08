import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { ChatUserStatus } from '../models/chat-user.model';

export type ChatAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Reusable initials avatar: a colored circle whose hue is derived from the
 * name, with an optional presence dot. Use it anywhere a participant/author
 * needs a face — message rows, member lists, call participants, toasts, etc.
 *
 * @example
 * <app-chat-avatar [name]="user.name" />
 * <app-chat-avatar [name]="member.name" size="sm" [status]="'online'" />
 * <app-chat-avatar name="ALL" size="xs"
 *   initialsOverride="ALL"
 *   backgroundOverride="rgba(143,116,255,0.2)"
 *   borderColorOverride="rgba(143,116,255,0.4)"
 *   textColorOverride="#c9bbff" />
 */
@Component({
  selector: 'app-chat-avatar',
  standalone: true,
  templateUrl: './chat-avatar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[style.background]': 'background()',
    '[style.border-color]': 'borderColor()',
    '[style.color]': 'textColor()',
    '[style.box-shadow]': 'boxShadow()',
  },
})
export class ChatAvatarComponent {
  /** Name used to derive initials and the avatar color (and shown to users). */
  name = input<string>('?');

  /** Real photo, if the person has one. Falls back to the initials below on load failure or when omitted. */
  avatarUrl = input<string | null>(null);

  /** Visual size. `md` matches the guest-room message rows. */
  size = input<ChatAvatarSize>('md');

  /** Optional presence dot. Omit for no dot. */
  status = input<ChatUserStatus | null>(null);

  /** True to add the drop shadow + inner highlight used on chat message avatars. */
  elevated = input<boolean>(false);

  /** Override the derived initials (e.g. the "ALL" badge). */
  initialsOverride = input<string | null>(null);

  /** Override the derived gradient background. */
  backgroundOverride = input<string | null>(null);

  /** Override the derived border color. */
  borderColorOverride = input<string | null>(null);

  /** Override the derived text color. */
  textColorOverride = input<string | null>(null);

  private readonly sizeClasses: Record<ChatAvatarSize, string> = {
    xs: 'size-6 rounded-md text-[9px]',
    sm: 'size-7 rounded-lg text-[10px]',
    md: 'size-9 rounded-xl text-[10px] tracking-[0.08em]',
    lg: 'size-16 rounded-2xl text-base tracking-[0.08em]',
  };

  protected readonly classes = computed(
    () =>
      `relative grid shrink-0 place-items-center border font-semibold ${this.sizeClasses[this.size()]}`,
  );

  protected readonly initials = computed(
    () => this.initialsOverride() ?? initialsFromName(this.name()),
  );

  protected readonly imageFailed = signal(false);

  protected readonly showImage = computed(() => this.avatarUrl() !== null && !this.imageFailed());

  constructor() {
    // A new url deserves a fresh attempt even if a previous one failed to load.
    effect(() => {
      this.avatarUrl();
      this.imageFailed.set(false);
    });
  }

  protected onImageError(): void {
    this.imageFailed.set(true);
  }

  protected readonly background = computed(
    () => this.backgroundOverride() ?? avatarGradient(this.name(), 0.34, 0.2),
  );

  protected readonly borderColor = computed(
    () => this.borderColorOverride() ?? avatarColor(this.name(), 0.42),
  );

  protected readonly textColor = computed(
    () => this.textColorOverride() ?? avatarColor(this.name(), 0.96, 88),
  );

  protected readonly boxShadow = computed(() =>
    this.elevated() ? '0 10px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)' : null,
  );

  protected readonly statusDotClass = computed(() => {
    const color =
      this.status() === 'online'
        ? 'bg-online'
        : this.status() === 'muted'
          ? 'bg-warning'
          : 'bg-[#687282]';
    return `absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-[#0f1117] ${color}`;
  });
}

/** Derive "JM" style initials from any display name. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

/** Deterministic hsla color from a name, used across avatars so the same name always gets the same color. */
export function avatarColor(name: string, alpha: number, lightness = 62): string {
  const normalized = name.trim().toLocaleLowerCase();
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = normalized.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsla(${hue} 72% ${lightness}% / ${alpha})`;
}

/** Diagonal gradient derived from a name. */
export function avatarGradient(name: string, alphaStart: number, alphaEnd: number): string {
  return `linear-gradient(135deg, ${avatarColor(name, alphaStart)}, ${avatarColor(name, alphaEnd)})`;
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CallIconType = 'call' | 'video' | 'mic' | 'leave';
export type CallIconShape = 'rounded' | 'circle';
export type CallIconVariant = 'ghost' | 'solid' | 'danger';
export type CallIconSize = 'sm' | 'md' | 'lg';

/**
 * Reusable call-style icon button (phone / video / mic / leave). Generic
 * enough to be reused OUTSIDE chat too — e.g. in a call control bar, a top
 * bar, or a meet-now button. Wire up clicks from the parent with a plain
 * `(click)` on the host element (the inner button's click bubbles).
 *
 * @example
 * <app-call-icon type="call" label="Meet now" />
 * <app-call-icon type="video" variant="solid" size="lg" shape="circle" label="Turn camera on" [active]="true" />
 * <app-call-icon type="leave" variant="danger" size="lg" shape="circle" label="Leave call" />
 */
@Component({
  selector: 'app-call-icon',
  standalone: true,
  templateUrl: './call-icon.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-label]': 'label()',
    '[attr.type]': "'button'",
    '[attr.aria-pressed]': 'active() ? "true" : null',
  },
})
export class CallIconComponent {
  /** Which icon to render. */
  type = input<CallIconType>('call');

  /** `sm` matches the guest-room header buttons. */
  size = input<CallIconSize>('sm');

  /** Rounded square (guest-room header) or circle (call control bar). */
  shape = input<CallIconShape>('rounded');

  /** Ghost = subtle bordered (headers); solid = primary filled; danger = red (leave/end). */
  variant = input<CallIconVariant>('ghost');

  /** Toggle state for mic/video (adds a highlight ring). */
  active = input<boolean>(false);

  /** Accessible name for the button. */
  label = input<string>('');

  protected readonly sizeButtonClass: Record<CallIconSize, string> = {
    sm: 'size-8',
    md: 'size-10',
    lg: 'size-12',
  };

  protected readonly sizeIconClass: Record<CallIconSize, string> = {
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-6',
  };

  protected readonly classes = computed(() => {
    const shapeClass = this.shape() === 'circle' ? 'rounded-full' : 'rounded-lg';

    const variantClass =
      this.variant() === 'solid'
        ? 'bg-primary text-white shadow-[0_14px_30px_rgba(124,92,252,0.35)] hover:bg-[#8b6dff]'
        : this.variant() === 'danger'
          ? 'bg-rose-500/90 text-white shadow-[0_14px_30px_rgba(244,63,94,0.35)] hover:bg-rose-500'
          : 'border border-white/8 bg-white/[0.03] text-[#c8cfdb] hover:border-white/20 hover:bg-white/10 hover:text-white';

    const activeClass = this.active()
      ? this.variant() === 'ghost'
        ? 'border-[#8f74ff]/60 bg-[#8f74ff]/20 text-[#f4f1ff]'
        : 'ring-2 ring-white/60 ring-offset-2 ring-offset-[#141821]'
      : '';

    return [
      'grid shrink-0 place-items-center transition',
      shapeClass,
      this.sizeButtonClass[this.size()],
      variantClass,
      activeClass,
    ].join(' ');
  });
}

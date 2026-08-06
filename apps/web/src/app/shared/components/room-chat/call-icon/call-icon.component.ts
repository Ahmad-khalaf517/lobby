import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CallIconType =
  | 'call'
  | 'mic'
  | 'mic-off'
  | 'screen-share'
  | 'screen-share-off'
  | 'copy'
  | 'close'
  | 'lock'
  | 'users'
  | 'reconnecting'
  | 'leave';
export type CallIconShape = 'rounded' | 'circle';
export type CallIconVariant = 'ghost' | 'solid' | 'danger';
export type CallIconSize = 'sm' | 'md' | 'lg';

/**
 * Reusable call-style icon button (phone / mic / leave / screen-share
 * / copy / close / lock / users / reconnecting). Renders a real <button> so
 * keyboard + screen-reader interaction works; the inner button's click bubbles
 * to the host, so parents can bind a plain `(click)`.
 *
 * @example
 * <app-call-icon type="call" label="Meet now" />
 * <app-call-icon type="mic" variant="solid" size="lg" shape="circle" label="Toggle microphone" [active]="true" />
 * <app-call-icon type="leave" variant="danger" size="lg" shape="circle" label="Leave call" />
 */
@Component({
  selector: 'app-call-icon',
  standalone: true,
  templateUrl: './call-icon.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
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

  /** Toggle state for microphone or screen sharing (adds a highlight ring). */
  active = input<boolean>(false);

  /** Disables the button (e.g. while the call isn't connected). */
  disabled = input<boolean>(false);

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
        ? this.active()
          ? 'bg-primary text-white shadow-[0_14px_30px_rgba(124,92,252,0.45)] hover:bg-[#8b6dff]'
          : 'bg-white/10 text-[#c7ced9] hover:bg-white/16'
        : this.variant() === 'danger'
          ? 'bg-rose-500 text-white shadow-[0_14px_30px_rgba(244,63,94,0.35)] hover:bg-rose-600'
          : this.active()
            ? 'border border-[#7c5cfc]/60 bg-[#7c5cfc]/20 text-[#f4f1ff]'
            : 'border border-white/8 bg-white/[0.03] text-[#c8cfdb] hover:border-white/20 hover:bg-white/10 hover:text-white';

    const disabledClass = this.disabled() ? 'pointer-events-none opacity-40' : '';

    return [
      'grid shrink-0 place-items-center transition',
      shapeClass,
      this.sizeButtonClass[this.size()],
      variantClass,
      disabledClass,
    ].join(' ');
  });
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';

/**
 * A small card showing a room code / invite link with a copy button that
 * flashes "Copied". Reused by the call room (room code) and the guest room
 * (guest invite link).
 */
@Component({
  selector: 'app-call-room-code-card',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './call-room-code-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallRoomCodeCardComponent {
  label = input<string>('Room code');
  value = input<string>('');
  copyLabel = input<string>('Copy code');
  copiedLabel = input<string>('Copied');
  emptyText = input<string>('No code yet');

  protected readonly copied = signal(false);

  private readonly destroyRef = inject(DestroyRef);
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
      }
    });
  }

  protected onCopy(): void {
    const value = this.value();
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(value).then(() => {
      this.copied.set(true);

      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
      }
      this.timeoutId = setTimeout(() => this.copied.set(false), 1500);
    });
  }
}

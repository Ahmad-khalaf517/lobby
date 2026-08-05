import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ChatAvatarComponent } from '../../room-chat/chat-avatar/chat-avatar.component';
import { CallIconComponent } from '../../room-chat/call-icon/call-icon.component';
import type { CallConnectionState } from '../models/call-participant.model';

/**
 * Top bar for a call: room name + GUEST badge, the live "Encrypted session"
 * pill (reflects the real LiveKit connection state), a session timer, an
 * "Invite friends" action and the current user's avatar.
 *
 * Presentational — all state comes in via inputs, actions go out via outputs.
 * The elapsed timer is the only UI state owned here.
 */
@Component({
  selector: 'app-call-top-bar',
  standalone: true,
  imports: [CallIconComponent, ChatAvatarComponent],
  templateUrl: './call-top-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallTopBarComponent {
  roomName = input<string>('Live room');
  subtitle = input<string>('Temporary call');
  connectionState = input<CallConnectionState>('connecting');
  participantCount = input(0);
  currentUserName = input('');

  protected readonly elapsedSeconds = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());

    effect(() => {
      const state = this.connectionState();
      if (state === 'connected' && this.timerId === null) {
        this.elapsedSeconds.set(0);
        this.timerId = setInterval(() => {
          this.elapsedSeconds.update((seconds) => seconds + 1);
        }, 1000);
      } else if (state !== 'connected' && state !== 'reconnecting') {
        this.stopTimer();
      }
    });
  }

  protected pillState(): { icon: 'lock' | 'reconnecting'; label: string; tone: string } {
    switch (this.connectionState()) {
      case 'connected':
        return {
          icon: 'lock',
          label: 'Encrypted session',
          tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
        };
      case 'reconnecting':
        return {
          icon: 'reconnecting',
          label: 'Reconnecting…',
          tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
        };
      case 'connecting':
        return {
          icon: 'reconnecting',
          label: 'Connecting…',
          tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
        };
      default:
        return {
          icon: 'lock',
          label: 'Disconnected',
          tone: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
        };
    }
  }

  protected formattedTime(): string {
    const total = this.elapsedSeconds();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

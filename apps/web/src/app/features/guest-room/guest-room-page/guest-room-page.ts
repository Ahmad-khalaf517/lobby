import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { io, type Socket } from 'socket.io-client';
import {
  ChannelSchema,
  ChatMessageBroadcastSchema,
  ChatMessagePayloadSchema,
  JoinChannelPayloadSchema,
  LeaveChannelPayloadSchema,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MessageHistorySchema,
  SOCKET_EVENTS,
  type Channel,
  type Message,
} from '@lobby/shared';
import { environment } from '../../../../environments/environment';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

type RoomStatus = 'needs-name' | 'loading' | 'ready' | 'not-found' | 'error';

@Component({
  selector: 'app-guest-room-page',
  imports: [ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './guest-room-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestRoomPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');

  protected readonly channelId = this.route.snapshot.paramMap.get('inviteCode') ?? '';

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxMessageLength = MAX_MESSAGE_LENGTH;
  protected readonly status = signal<RoomStatus>('needs-name');
  protected readonly errorMessage = signal('');
  protected readonly channel = signal<Channel | null>(null);
  protected readonly messages = signal<Message[]>([]);
  protected readonly connected = signal(false);
  protected readonly displayName = signal('');

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
  });

  protected readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_MESSAGE_LENGTH)],
  });

  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;

  constructor() {
    if (!this.channelId) {
      this.status.set('not-found');
    } else {
      const nameFromLink = this.route.snapshot.queryParamMap.get('name')?.trim();
      if (nameFromLink) {
        this.enterRoom(nameFromLink);
      }
    }

    // Keep the message list pinned to the latest entry as new ones arrive.
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const el = this.scrollAnchor()?.nativeElement;
        el?.scrollIntoView({ block: 'end' });
      });
    });

    this.destroyRef.onDestroy(() => this.disconnect());
  }

  protected submitName(): void {
    if (this.nameControl.invalid) {
      this.nameControl.markAsTouched();
      return;
    }
    this.enterRoom(this.nameControl.value.trim());
  }

  private enterRoom(name: string): void {
    this.displayName.set(name);
    this.status.set('loading');

    this.http.get<unknown>(`${environment.apiUrl}/channels/${this.channelId}`).subscribe({
      next: (response) => {
        this.channel.set(ChannelSchema.parse(response));
        this.loadHistoryAndConnect();
      },
      error: (err: { status?: number }) => {
        this.status.set(err.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadHistoryAndConnect(): void {
    this.http.get<unknown>(`${environment.apiUrl}/channels/${this.channelId}/messages`).subscribe({
      next: (response) => {
        this.messages.set(MessageHistorySchema.parse(response).messages);
        this.status.set('ready');
        this.connectSocket();
      },
      error: () => this.status.set('error'),
    });
  }

  private connectSocket(): void {
    // Empty apiUrl (dev) => same-origin, handled by proxy.conf.json.
    // Absolute apiUrl (production) => connect to that origin directly.
    const socket = io(environment.apiUrl || undefined);
    this.socket = socket;

    socket.on('connect', () => {
      // Transport-level connect only — joinChannel is async server-side (it
      // opens a channel_members row), so sending is not actually safe yet.
      // `connected` flips true on the first memberList below instead, which
      // the server only broadcasts once the join has really completed.
      const payload = { channelId: this.channelId, name: this.displayName() };
      socket.emit(SOCKET_EVENTS.JOIN_CHANNEL, JoinChannelPayloadSchema.parse(payload));
    });

    socket.on('disconnect', () => this.connected.set(false));

    socket.on(SOCKET_EVENTS.MEMBER_LIST, () => this.connected.set(true));

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (raw: unknown) => {
      const message = ChatMessageBroadcastSchema.parse(raw);
      this.messages.update((current) => [...current, message]);
      if (!this.isOwnMessage(message)) {
        this.playNotificationSound();
      }
    });

    socket.on('exception', (err: { message?: string }) => {
      this.errorMessage.set(err.message ?? 'The channel disconnected unexpectedly.');
      this.status.set('error');
    });
  }

  protected sendMessage(): void {
    if (this.messageControl.invalid || !this.socket?.connected) {
      this.messageControl.markAsTouched();
      return;
    }

    const payload = {
      channelId: this.channelId,
      name: this.displayName(),
      text: this.messageControl.value.trim(),
    };

    this.socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, ChatMessagePayloadSchema.parse(payload));
    this.messageControl.reset('');
  }

  protected initials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase();
  }

  protected messageTime(message: Message): string {
    return new Date(message.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected isOwnMessage(message: Message): boolean {
    return message.authorName === this.displayName();
  }

  /**
   * A short synthesized chime — no audio asset/dependency needed. A rising
   * C6-E6-G6 major triad, softened with a lowpass filter and a slow
   * exponential decay so it lands closer to a gentle "pop" than a harsh
   * beep. `typeof AudioContext === 'undefined'` guards SSR (no Web Audio
   * API in Node); the joinChannel flow already involved a user gesture
   * (typing a name, clicking Join), so the browser's autoplay policy
   * shouldn't block it.
   */
  private playNotificationSound(): void {
    if (typeof AudioContext === 'undefined') return;

    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const notes = [
      { frequency: 1046.5, start: 0 }, // C6
      { frequency: 1318.5, start: 0.07 }, // E6
      { frequency: 1568, start: 0.14 }, // G6
    ];

    for (const { frequency, start } of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      filter.type = 'lowpass';
      filter.frequency.value = 4000;

      const noteStart = now + start;
      const attack = 0.015;
      const decay = 0.35;

      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(0.18, noteStart + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + attack + decay);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(noteStart);
      oscillator.stop(noteStart + attack + decay + 0.05);
    }
  }

  private disconnect(): void {
    void this.audioContext?.close();
    this.audioContext = null;

    if (!this.socket) return;

    if (this.socket.connected) {
      const payload = LeaveChannelPayloadSchema.parse({ channelId: this.channelId });
      this.socket.emit(SOCKET_EVENTS.LEAVE_CHANNEL, payload);
    }

    this.socket.disconnect();
    this.socket = null;
  }

  protected goToGuests(): void {
    void this.router.navigate(['/guests']);
  }
}

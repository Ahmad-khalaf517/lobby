import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  HostListener,
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
  private readonly composerInput = viewChild<ElementRef<HTMLInputElement>>('composerInput');
  private readonly emojiPickerHost = viewChild<ElementRef<HTMLElement>>('emojiPickerHost');

  protected readonly channelId = this.route.snapshot.paramMap.get('inviteCode') ?? '';

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxMessageLength = MAX_MESSAGE_LENGTH;
  protected readonly status = signal<RoomStatus>('needs-name');
  protected readonly errorMessage = signal('');
  protected readonly channel = signal<Channel | null>(null);
  protected readonly messages = signal<Message[]>([]);
  protected readonly connected = signal(false);
  protected readonly displayName = signal('');
  protected readonly emojiPickerOpen = signal(false);
  protected readonly emojis = [
    '😀',
    '😂',
    '😍',
    '😎',
    '🤔',
    '👏',
    '🙌',
    '🔥',
    '💯',
    '🎉',
    '👍',
    '❤️',
  ];

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
  });

  protected readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_MESSAGE_LENGTH)],
  });

  private socket: Socket | null = null;

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
    this.emojiPickerOpen.set(false);
  }

  protected toggleEmojiPicker(): void {
    this.emojiPickerOpen.update((open) => !open);
  }

  protected selectEmoji(emoji: string): void {
    const input = this.composerInput()?.nativeElement;
    const current = this.messageControl.value;

    if (!input) {
      this.messageControl.setValue(`${current}${emoji}`);
      this.emojiPickerOpen.set(false);
      return;
    }

    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const nextValue = `${current.slice(0, start)}${emoji}${current.slice(end)}`;

    this.messageControl.setValue(nextValue);
    this.emojiPickerOpen.set(false);

    queueMicrotask(() => {
      input.focus();
      const cursor = start + emoji.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.emojiPickerOpen()) {
      return;
    }

    const target = event.target;
    const host = this.emojiPickerHost()?.nativeElement;
    if (target instanceof Node && host && !host.contains(target)) {
      this.emojiPickerOpen.set(false);
    }
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return '??';
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  protected avatarBackground(name: string): string {
    return `linear-gradient(135deg, ${this.avatarColor(name, 0.34)}, ${this.avatarColor(name, 0.2)})`;
  }

  protected avatarBorder(name: string): string {
    return this.avatarColor(name, 0.42);
  }

  protected avatarText(name: string): string {
    return this.avatarColor(name, 0.96, 88);
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

  private disconnect(): void {
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

  private avatarColor(name: string, alpha: number, lightness = 62): string {
    const normalized = name.trim().toLocaleLowerCase();
    let hash = 0;

    for (let index = 0; index < normalized.length; index += 1) {
      hash = normalized.charCodeAt(index) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsla(${hue} 72% ${lightness}% / ${alpha})`;
  }
}

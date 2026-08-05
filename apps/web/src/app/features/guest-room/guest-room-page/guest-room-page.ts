import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { io, type Socket } from 'socket.io-client';
import {
  CallStatusResponseSchema,
  ChannelSchema,
  ChatMessageBroadcastSchema,
  ChatMessagePayloadSchema,
  DeleteMessagePayloadSchema,
  JoinChannelPayloadSchema,
  LeaveChannelPayloadSchema,
  MemberListSchema,
  MAX_NAME_LENGTH,
  MessageDeletedBroadcastSchema,
  MessageReactionBroadcastSchema,
  MessageReactionPayloadSchema,
  MessageHistorySchema,
  SOCKET_EVENTS,
  type Channel,
  type Member,
  type Message,
} from '@lobby/shared';
import { environment } from '../../../../environments/environment';
import {
  type ChatMessage,
  type ChatReaction,
  type ChatUser,
  CallIconComponent,
  RoomChatComponent,
  initialsFromName,
} from '../../../shared/components/room-chat';
import {
  CallParticipantsSidebarComponent,
  CallRoomCodeCardComponent,
  type CallParticipant,
} from '../../../shared/components/call-room';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

type RoomStatus = 'needs-name' | 'loading' | 'ready' | 'not-found' | 'error';

type MessageToast = {
  id: number;
  name: string;
  text: string;
};

type MessageReactionState = {
  counts: Record<string, number>;
  byUser: Record<string, string>;
};

const TOAST_LIFETIME_MS = 4500;
const TOAST_TEXT_PREVIEW_LENGTH = 80;
const CALL_STATUS_POLL_MS = 10_000;

@Component({
  selector: 'app-guest-room-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LogoComponent,
    RoomChatComponent,
    CallIconComponent,
    CallParticipantsSidebarComponent,
    CallRoomCodeCardComponent,
  ],
  templateUrl: './guest-room-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestRoomPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly roomChat = viewChild(RoomChatComponent);

  protected readonly channelId = this.route.snapshot.paramMap.get('inviteCode') ?? '';

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly status = signal<RoomStatus>('needs-name');
  protected readonly errorMessage = signal('');
  protected readonly channel = signal<Channel | null>(null);
  protected readonly messages = signal<Message[]>([]);
  protected readonly members = signal<Member[]>([]);
  protected readonly connected = signal(false);
  protected readonly displayName = signal('');
  /** At most one entry — a new toast replaces whatever's currently showing rather than stacking. */
  protected readonly toasts = signal<MessageToast[]>([]);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly messageReactions = signal<Record<string, MessageReactionState>>({});
  /** Whether a LiveKit call is currently live in this channel (from the API poll). */
  protected readonly callActive = signal(false);
  /** True once the user dismissed the "Join the call" banner. */
  protected readonly joinCallDismissed = signal(false);

  protected readonly chatMessages = computed<ChatMessage[]>(() =>
    this.messages().map((message) => this.toChatMessage(message)),
  );

  protected readonly currentUser = computed<ChatUser>(() => ({
    id: this.displayName(),
    name: this.displayName(),
  }));

  protected readonly memberNames = computed<string[]>(() =>
    this.members()
      .map((member) => member.name.trim())
      .filter(Boolean),
  );

  /** Socket presence members mapped onto the shared CallParticipant shape for the participants sidebar. */
  protected readonly memberParticipants = computed<CallParticipant[]>(() =>
    this.members().map((member) => ({
      id: member.socketId,
      name: member.name,
      isLocal: member.name === this.displayName(),
      isSpeaking: false,
      isMicMuted: false,
      isCameraOff: true,
      cameraTrack: null,
      screenShareTrack: null,
    })),
  );

  /** Shared initials derivation, exposed for the toast markup. */
  protected readonly initials = initialsFromName;

  /**
   * Show the "Join the call" banner only while a call is genuinely live AND the
   * user hasn't dismissed it. Dismissal re-arms once the call ends so a later
   * call can prompt again.
   */
  protected readonly joinCallBannerVisible = computed(
    () => this.callActive() && !this.joinCallDismissed(),
  );

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
  });

  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private nextToastId = 0;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private callStatusIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!this.channelId) {
      this.status.set('not-found');
    } else {
      const nameFromLink = this.route.snapshot.queryParamMap.get('name')?.trim();
      if (nameFromLink) {
        this.enterRoom(nameFromLink);
      }
    }

    // Re-arm the "Join the call" banner when the call ends so a later call can
    // prompt the user again (unless they've navigated away).
    effect(() => {
      if (!this.callActive()) {
        this.joinCallDismissed.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.disconnect();
      if (this.callStatusIntervalId !== null) {
        clearInterval(this.callStatusIntervalId);
        this.callStatusIntervalId = null;
      }
    });
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
        try {
          this.channel.set(ChannelSchema.parse(response));
          this.loadHistoryAndConnect();
        } catch {
          this.errorMessage.set('The channel payload is invalid. Please refresh and try again.');
          this.status.set('error');
        }
      },
      error: (err: { status?: number }) => {
        this.status.set(err.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadHistoryAndConnect(): void {
    this.http.get<unknown>(`${environment.apiUrl}/channels/${this.channelId}/messages`).subscribe({
      next: (response) => {
        try {
          const history = MessageHistorySchema.parse(response);
          this.messages.set(history.messages);
          this.messageReactions.set(this.hydrateReactionState(history.messages));
          this.status.set('ready');
          queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
          this.startCallStatusPolling();
          this.connectSocket();
        } catch {
          this.errorMessage.set('Unable to parse channel history. Please refresh and try again.');
          this.status.set('error');
        }
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

    socket.on('disconnect', () => {
      this.connected.set(false);
      this.members.set([]);
    });

    socket.on(SOCKET_EVENTS.MEMBER_LIST, (raw: unknown) => {
      const payload = MemberListSchema.parse(raw);
      this.members.set(payload.members);
      this.connected.set(true);
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (raw: unknown) => {
      const shouldStickToBottom = this.roomChat()?.isNearBottom() ?? true;
      const message = ChatMessageBroadcastSchema.parse(raw);
      this.messages.update((current) => [...current, message]);

      if (shouldStickToBottom || message.authorName === this.displayName()) {
        queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
      }

      if (message.authorName !== this.displayName()) {
        this.playNotificationSound();
        this.showToast(message);
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_REACTION, (raw: unknown) => {
      const reaction = MessageReactionBroadcastSchema.parse(raw);
      this.applyReactionUpdate(
        reaction.messageId,
        reaction.reactedBy,
        reaction.emoji,
        reaction.removed,
      );
    });

    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, (raw: unknown) => {
      const { messageId } = MessageDeletedBroadcastSchema.parse(raw);
      this.removeMessageLocally(messageId);
    });

    socket.on('exception', (err: { message?: string }) => {
      this.errorMessage.set(err.message ?? 'The channel disconnected unexpectedly.');
      this.status.set('error');
    });
  }

  /** room-chat emits the final text (reply prefix already applied); send it over the socket. */
  protected onSendMessage(text: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload = ChatMessagePayloadSchema.parse({
      channelId: this.channelId,
      name: this.displayName(),
      text,
    });

    this.socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
    queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
  }

  /** room-chat already shows the reply preview + focuses the composer — nothing more needed for guests. */
  protected onReact({ messageId, emoji }: { messageId: string; emoji: string }): void {
    if (!this.socket?.connected) {
      return;
    }

    const reactedBy = this.displayName();
    const userKey = reactedBy.trim().toLocaleLowerCase();
    const currentEmoji = this.messageReactions()[messageId]?.byUser[userKey];
    const removing = currentEmoji === emoji;

    this.applyReactionUpdate(messageId, reactedBy, emoji, removing);

    const payload = MessageReactionPayloadSchema.parse({
      channelId: this.channelId,
      messageId,
      emoji,
    });
    this.socket.emit(SOCKET_EVENTS.MESSAGE_REACTION, payload);
  }

  protected onDelete(messageId: string): void {
    this.removeMessageLocally(messageId);

    if (this.socket?.connected) {
      const payload = DeleteMessagePayloadSchema.parse({
        channelId: this.channelId,
        messageId,
      });
      this.socket.emit(SOCKET_EVENTS.DELETE_MESSAGE, payload);
    }
  }

  protected onCloseChat(): void {
    this.goToGuests();
  }

  private removeMessageLocally(messageId: string): void {
    this.messages.update((current) => current.filter((message) => message.id !== messageId));
    this.messageReactions.update((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  protected toggleSidebar(): void {
    this.playClickSound();
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  protected guestInviteLink(): string {
    if (typeof window === 'undefined') {
      return `/guest/${this.channelId}`;
    }

    const baseUrl = window.location.origin;
    return `${baseUrl}/guest/${this.channelId}`;
  }

  protected goToCall(): void {
    void this.router.navigate(['/guest', this.channelId, 'call'], {
      queryParams: { name: this.displayName() },
    });
  }

  protected dismissJoinCall(): void {
    this.joinCallDismissed.set(true);
  }

  /**
   * Poll the API for LiveKit call state while the room is open so the "Join
   * the call" banner only appears when a call is genuinely live.
   */
  private startCallStatusPolling(): void {
    const poll = (): void => {
      this.http
        .get<unknown>(`${environment.apiUrl}/channels/${this.channelId}/call-status`)
        .subscribe({
          next: (raw) => {
            try {
              this.callActive.set(CallStatusResponseSchema.parse(raw).active);
            } catch {
              this.callActive.set(false);
            }
          },
          error: () => this.callActive.set(false),
        });
    };

    poll();
    this.callStatusIntervalId = setInterval(poll, CALL_STATUS_POLL_MS);
  }

  protected goToGuests(): void {
    void this.router.navigate(['/guests']);
  }

  private toChatMessage(message: Message): ChatMessage {
    const state = this.messageReactions()[message.id];
    const ownReaction = state?.byUser[this.currentReactionUserKey()] ?? null;

    const reactions: ChatReaction[] = state
      ? Object.entries(state.counts)
          .map(([emoji, count]) => ({ emoji, count, reactedByMe: ownReaction === emoji }))
          .sort((a, b) => b.count - a.count)
      : [];

    return {
      id: message.id,
      author: { id: message.authorName, name: message.authorName },
      text: message.text,
      createdAt: message.createdAt,
      reactions,
      ownReaction,
    };
  }

  /**
   * A brief "name: message" banner — useful when a new message lands while
   * scrolled up in history. Replaces whatever toast is currently showing
   * (array is only ever 0-1 long) rather than stacking — a new id each time
   * also gives @for's track a reason to destroy/recreate the element so the
   * slide-in animation replays instead of silently updating in place.
   */
  private showToast(message: Message): void {
    const id = this.nextToastId++;
    const text =
      message.text.length > TOAST_TEXT_PREVIEW_LENGTH
        ? `${message.text.slice(0, TOAST_TEXT_PREVIEW_LENGTH).trimEnd()}…`
        : message.text;

    if (this.toastTimeoutId !== null) {
      clearTimeout(this.toastTimeoutId);
    }

    this.toasts.set([{ id, name: message.authorName, text }]);
    this.toastTimeoutId = setTimeout(() => this.dismissToast(id), TOAST_LIFETIME_MS);
  }

  protected dismissToast(id: number): void {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }

  private applyReactionUpdate(
    messageId: string,
    reactedBy: string,
    emoji: string,
    removed = false,
  ): void {
    const userKey = reactedBy.trim().toLocaleLowerCase();

    this.messageReactions.update((current) => {
      const existing = current[messageId] ?? { counts: {}, byUser: {} };
      const currentEmoji = existing.byUser[userKey];
      const nextCounts = { ...existing.counts };

      if (removed) {
        if (currentEmoji) {
          const decremented = (nextCounts[currentEmoji] ?? 1) - 1;
          if (decremented <= 0) {
            delete nextCounts[currentEmoji];
          } else {
            nextCounts[currentEmoji] = decremented;
          }
        }

        const nextByUser = { ...existing.byUser };
        delete nextByUser[userKey];

        return {
          ...current,
          [messageId]: { counts: nextCounts, byUser: nextByUser },
        };
      }

      if (currentEmoji === emoji) {
        return current;
      }

      if (currentEmoji) {
        const decremented = (nextCounts[currentEmoji] ?? 1) - 1;
        if (decremented <= 0) {
          delete nextCounts[currentEmoji];
        } else {
          nextCounts[currentEmoji] = decremented;
        }
      }

      nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;

      return {
        ...current,
        [messageId]: {
          counts: nextCounts,
          byUser: {
            ...existing.byUser,
            [userKey]: emoji,
          },
        },
      };
    });
  }

  private hydrateReactionState(messages: Message[]): Record<string, MessageReactionState> {
    const nextState: Record<string, MessageReactionState> = {};

    for (const message of messages) {
      const reactions = Array.isArray(message.reactions) ? message.reactions : [];

      for (const reaction of reactions) {
        const messageState =
          nextState[message.id] ??
          ({
            counts: {},
            byUser: {},
          } satisfies MessageReactionState);

        const userKey = reaction.reactedBy.trim().toLocaleLowerCase();
        messageState.byUser[userKey] = reaction.emoji;
        messageState.counts[reaction.emoji] = (messageState.counts[reaction.emoji] ?? 0) + 1;
        nextState[message.id] = messageState;
      }
    }

    return nextState;
  }

  /**
   * A short synthesized "tick" used for UI clicks (e.g. the sidebar toggle).
   * A 1.5kHz square-wave burst through a highpass filter gives a sharp,
   * physical click feel. `typeof AudioContext === 'undefined'` guards SSR.
   */
  private playClickSound(): void {
    if (typeof AudioContext === 'undefined') return;

    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1500, now);
    filter.type = 'highpass';
    filter.frequency.value = 900;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
  }

  /**
   * A short synthesized chime — no audio asset/dependency needed. A rising
   * C6-E6-G6 major triad, softened with a lowpass filter and a slow
   * exponential decay so it lands closer to a gentle "pop" than a harsh
   * beep. `typeof AudioContext === 'undefined'` guards SSR (no Web Audio
   * API in Node); the joinChannel flow already involved a user gesture
   * (typing a name, clicking Join), so the browser's autoplay policy
   * shouldn't block it. Skipped while the page has focus — the toast +
   * inline message are already enough feedback when you're looking at it;
   * the sound is for when you're not.
   */
  private playNotificationSound(): void {
    if (typeof AudioContext === 'undefined' || document.hasFocus()) return;

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
    this.members.set([]);

    if (!this.socket) return;

    if (this.socket.connected) {
      const payload = LeaveChannelPayloadSchema.parse({ channelId: this.channelId });
      this.socket.emit(SOCKET_EVENTS.LEAVE_CHANNEL, payload);
    }

    this.socket.disconnect();
    this.socket = null;
  }

  private currentReactionUserKey(): string {
    return this.displayName().trim().toLocaleLowerCase() || 'guest';
  }
}

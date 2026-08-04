import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
  DeleteMessagePayloadSchema,
  JoinChannelPayloadSchema,
  LeaveChannelPayloadSchema,
  MemberListSchema,
  MAX_MESSAGE_LENGTH,
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
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

type RoomStatus = 'needs-name' | 'loading' | 'ready' | 'not-found' | 'error';

type MessageToast = {
  id: number;
  name: string;
  text: string;
};

type PendingReply = {
  messageId: string;
  authorName: string;
  text: string;
};

type MessageReactionState = {
  counts: Record<string, number>;
  byUser: Record<string, string>;
};

type ParsedReplyMessage = {
  authorName: string;
  previewText: string;
  bodyText: string;
};

const TOAST_LIFETIME_MS = 4500;
const TOAST_TEXT_PREVIEW_LENGTH = 80;

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
  private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private readonly composerInput = viewChild<ElementRef<HTMLInputElement>>('composerInput');
  private readonly emojiPickerHost = viewChild<ElementRef<HTMLElement>>('emojiPickerHost');

  protected readonly channelId = this.route.snapshot.paramMap.get('inviteCode') ?? '';

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxMessageLength = MAX_MESSAGE_LENGTH;
  protected readonly status = signal<RoomStatus>('needs-name');
  protected readonly errorMessage = signal('');
  protected readonly channel = signal<Channel | null>(null);
  protected readonly messages = signal<Message[]>([]);
  protected readonly members = signal<Member[]>([]);
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
  /** At most one entry — a new toast replaces whatever's currently showing rather than stacking. */
  protected readonly toasts = signal<MessageToast[]>([]);
  protected readonly showScrollToNewest = signal(false);
  protected readonly inviteCopied = signal(false);
  protected readonly messageReactionMenuId = signal<string | null>(null);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly mentionQuery = signal<string | null>(null);
  protected readonly mentionHighlightIndex = signal(0);
  protected readonly pendingReply = signal<PendingReply | null>(null);
  protected readonly messageReactions = signal<Record<string, MessageReactionState>>({});

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
  private nextToastId = 0;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private inviteCopiedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.channelId) {
      this.status.set('not-found');
    } else {
      const nameFromLink = this.route.snapshot.queryParamMap.get('name')?.trim();
      if (nameFromLink) {
        this.enterRoom(nameFromLink);
      }
    }

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
          queueMicrotask(() => this.scrollToNewest(false));
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
      const shouldStickToBottom = this.isNearBottom();
      const message = ChatMessageBroadcastSchema.parse(raw);
      this.messages.update((current) => [...current, message]);

      if (shouldStickToBottom || this.isOwnMessage(message)) {
        queueMicrotask(() => this.scrollToNewest(false));
      }

      if (!this.isOwnMessage(message)) {
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

  protected sendMessage(): void {
    if (this.messageControl.invalid || !this.socket?.connected) {
      this.messageControl.markAsTouched();
      return;
    }

    const rawText = this.messageControl.value.trim();
    const reply = this.pendingReply();
    const replySnippet = reply?.text.replace(/\s+/g, ' ').trim().slice(0, 80);
    const text = reply ? `↪ Reply to ${reply.authorName}: ${replySnippet}\n${rawText}` : rawText;

    const payload = {
      channelId: this.channelId,
      name: this.displayName(),
      text,
    };

    this.socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, ChatMessagePayloadSchema.parse(payload));
    this.messageControl.reset('');
    this.pendingReply.set(null);
    this.emojiPickerOpen.set(false);
    this.mentionQuery.set(null);
    queueMicrotask(() => this.scrollToNewest(false));
  }

  protected onMessagesScroll(): void {
    this.showScrollToNewest.set(!this.isNearBottom());
  }

  protected jumpToNewestMessage(): void {
    this.scrollToNewest(true);
  }

  protected toggleMessageReactionMenu(messageId: string): void {
    this.messageReactionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  protected toggleSidebar(): void {
    this.playClickSound();
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  protected replyToMessage(message: Message): void {
    this.messageReactionMenuId.set(null);
    this.emojiPickerOpen.set(false);
    this.pendingReply.set({
      messageId: message.id,
      authorName: message.authorName,
      text: message.text,
    });

    queueMicrotask(() => {
      this.composerInput()?.nativeElement.focus();
    });
  }

  protected clearPendingReply(): void {
    this.pendingReply.set(null);
  }

  protected onComposerInput(): void {
    const input = this.composerInput()?.nativeElement;
    if (!input) return;

    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);

    this.mentionQuery.set(match ? match[1] : null);
    if (match) {
      this.mentionHighlightIndex.set(0);
    }
  }

  protected mentionSuggestions(): Array<{ name: string; kind: 'all' | 'member' }> {
    const query = this.mentionQuery();
    if (query === null) return [];

    const normalized = query.trim().toLocaleLowerCase();
    const members = this.members()
      .filter(
        (member) => !normalized || member.name.trim().toLocaleLowerCase().includes(normalized),
      )
      .map((member) => ({ name: member.name.trim(), kind: 'member' as const }));
    const results: Array<{ name: string; kind: 'all' | 'member' }> = [...members];

    if (!normalized || 'all'.includes(normalized)) {
      results.unshift({ name: 'all', kind: 'all' });
    }

    return results.slice(0, 8);
  }

  protected insertMention(name: string): void {
    const input = this.composerInput()?.nativeElement;
    if (!input) return;

    const value = input.value;
    const caret = input.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@[\p{L}\p{N}_]*$/u);
    const mentionStart = match ? match.index! + match[0].indexOf('@') : caret;
    const mention = `@${name} `;

    this.messageControl.setValue(value.slice(0, mentionStart) + mention + value.slice(caret));
    this.mentionQuery.set(null);

    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(mentionStart + mention.length, mentionStart + mention.length);
    });
  }

  protected onMentionKeydown(event: KeyboardEvent): void {
    if (this.mentionQuery() === null) return;

    const suggestions = this.mentionSuggestions();
    if (suggestions.length === 0) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const index = Math.min(this.mentionHighlightIndex(), suggestions.length - 1);
      this.insertMention(suggestions[index].name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.mentionQuery.set(null);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.mentionHighlightIndex.update((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.mentionHighlightIndex.update(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    }
  }

  protected onComposerBlur(): void {
    this.mentionQuery.set(null);
  }

  protected reactToMessage(message: Message, emoji: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const reactedBy = this.displayName();
    const userKey = reactedBy.trim().toLocaleLowerCase();
    const currentEmoji = this.messageReactions()[message.id]?.byUser[userKey];
    const removing = currentEmoji === emoji;

    this.applyReactionUpdate(message.id, reactedBy, emoji, removing);

    const payload = MessageReactionPayloadSchema.parse({
      channelId: this.channelId,
      messageId: message.id,
      emoji,
    });
    this.socket.emit(SOCKET_EVENTS.MESSAGE_REACTION, payload);
    this.messageReactionMenuId.set(null);
  }

  protected deleteMessage(messageId: string): void {
    this.removeMessageLocally(messageId);

    if (this.socket?.connected) {
      const payload = DeleteMessagePayloadSchema.parse({
        channelId: this.channelId,
        messageId,
      });
      this.socket.emit(SOCKET_EVENTS.DELETE_MESSAGE, payload);
    }
  }

  private removeMessageLocally(messageId: string): void {
    this.messages.update((current) => current.filter((message) => message.id !== messageId));

    if (this.pendingReply()?.messageId === messageId) {
      this.pendingReply.set(null);
    }

    this.messageReactionMenuId.set(null);
    this.messageReactions.update((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  protected currentReactionForMessage(messageId: string): string | null {
    const state = this.messageReactions()[messageId];
    if (!state) return null;

    return state.byUser[this.currentReactionUserKey()] ?? null;
  }

  protected reactionSummary(messageId: string): Array<{ emoji: string; count: number }> {
    const reactions = this.messageReactions()[messageId]?.counts ?? {};

    return Object.entries(reactions)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }

  protected guestInviteLink(): string {
    if (typeof window === 'undefined') {
      return `/guest/${this.channelId}`;
    }

    const baseUrl = window.location.origin;
    return `${baseUrl}/guest/${this.channelId}`;
  }

  protected copyGuestInviteLink(): void {
    const link = this.guestInviteLink();

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(link).then(() => {
      this.inviteCopied.set(true);

      if (this.inviteCopiedTimeoutId !== null) {
        clearTimeout(this.inviteCopiedTimeoutId);
      }

      this.inviteCopiedTimeoutId = setTimeout(() => this.inviteCopied.set(false), 1500);
    });
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
      // fall through to close the message reaction menu if needed
    }

    const target = event.target;
    const host = this.emojiPickerHost()?.nativeElement;
    if (this.emojiPickerOpen() && target instanceof Node && host && !host.contains(target)) {
      this.emojiPickerOpen.set(false);
    }

    if (
      this.messageReactionMenuId() &&
      target instanceof Element &&
      !target.closest('[data-message-reaction-menu]') &&
      !target.closest('[data-message-react-button]')
    ) {
      this.messageReactionMenuId.set(null);
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

  protected parsedReplyMessage(message: Message): ParsedReplyMessage | null {
    const match = message.text.match(/^↪ Reply to (.+?): (.*)\n([\s\S]+)$/);
    if (!match) {
      return null;
    }

    const [, authorName, previewText, bodyText] = match;
    return {
      authorName,
      previewText,
      bodyText,
    };
  }

  /**
   * Splits raw message text into plain/mention segments so the template can
   * render @mentions as highlighted chips without touching innerHTML (no
   * XSS surface). A mention is any `@word`, a full multi-word member name
   * (e.g. `@Mahmoud Ag`), or the special `@all` / `@everyone`.
   */
  protected mentionParts(text: string): Array<{ text: string; kind: 'all' | 'member' | 'text' }> {
    const names = Array.from(
      new Set(
        this.members()
          .map((m) => m.name.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => b.length - a.length);
    const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = ['@(?:all|everyone)\\b'];
    if (names.length > 0) {
      patterns.push(`@(?:${names.map(escapeRegExp).join('|')})(?=\\s|$)`);
    }
    patterns.push('@[\\p{L}\\p{N}_]+');
    const matcher = new RegExp(patterns.join('|'), 'giu');

    const parts: Array<{ text: string; kind: 'all' | 'member' | 'text' }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(text)) !== null) {
      const index = match.index;
      if (index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, index), kind: 'text' });
      }
      const matched = match[0].slice(1).toLocaleLowerCase();
      parts.push({
        text: match[0],
        kind: matched === 'all' || matched === 'everyone' ? 'all' : 'member',
      });
      lastIndex = index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), kind: 'text' });
    }

    return parts;
  }

  protected isOwnMessage(message: Message): boolean {
    return message.authorName === this.displayName();
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

  private isNearBottom(): boolean {
    const el = this.messagesContainer()?.nativeElement;
    if (!el) return true;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= 56;
  }

  private scrollToNewest(smooth: boolean): void {
    const el = this.scrollAnchor()?.nativeElement;
    if (!el) return;

    el.scrollIntoView({
      block: 'end',
      behavior: smooth ? 'smooth' : 'auto',
    });
    this.showScrollToNewest.set(false);
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

  private currentReactionUserKey(): string {
    return this.displayName().trim().toLocaleLowerCase() || 'guest';
  }
}

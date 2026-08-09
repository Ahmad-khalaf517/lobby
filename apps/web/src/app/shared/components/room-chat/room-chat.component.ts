import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LobbyIconComponent } from '../../ui/icon/lobby-icon.component';
import { ChatSidebarComponent } from './chat-sidebar/chat-sidebar.component';
import {
  DEFAULT_CHAT_EMOJIS,
  type ChatMessage,
  type ChatReplyPreview,
  type SendChatMessage,
} from './models/chat-message.model';

/**
 * Room chat — the top-level, reusable chat panel. This is the ONLY component
 * other pages should import for a full chat experience; it composes the sidebar,
 * message list, composer, mentions, replies, reactions and deletion, and owns
 * the transient UI state (open reaction menu, active reply preview).
 *
 * The host page owns the DATA: it passes `messages`/`currentUserId`/
 * `memberNames` in and decides what each output event means (e.g. send the
 * text over a socket, persist a reaction, delete a message, navigate away on
 * close). No socket / persistence logic lives here.
 *
 * ---------------------------------------------------------------------------
 * Reusing individual pieces
 * ---------------------------------------------------------------------------
 *
 * `app-chat-avatar` is intentionally generic and can be used in participant
 * lists or call controls. Icons are provided through the shared Lucide-based
 * `app-icon` component.
 *
 * `app-chat-message` renders one message bubble (avatar + hover actions +
 * reaction chips) given a `ChatMessage`; `app-chat-bar` is a standalone
 * composer. All of them are presentational — pass data in via inputs, wire
 * actions out via outputs.
 *
 * @example
 * <app-room-chat
 *   [title]="roomName"
 *   [subtitle]="'Temporary conversation'"
 *   [messages]="chatMessages"
 *   [currentUserId]="currentUser.id"
 *   [memberNames]="memberNames"
 *   (sendMessage)="onSend($event)"
 *   (replyToMessage)="onReply($event)"
 *   (reactToMessage)="onReact($event)"
 *   (deleteMessage)="onDelete($event)"
 *   (close)="goBack()">
 *   <button chat-header-leading (click)="toggleSidebar()">…</button>
 * </app-room-chat>
 */
@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [LobbyIconComponent, ChatSidebarComponent],
  templateUrl: './room-chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class RoomChatComponent {
  /** Header title. */
  title = input<string>('Room chat');

  /** Small line under the header title. Omit for no subtitle. */
  subtitle = input<string>('Temporary conversation');

  /** Optional info banner shown between the header and the message list. */
  infoBannerText = input<string | null>(null);

  /** Messages to render, oldest → newest. */
  messages = input<ChatMessage[]>([]);

  /** Current user's id — used to style own messages ("You" tag + bubble color). */
  currentUserId = input<string>('');

  /** Member names for @mention highlighting + suggestions. */
  memberNames = input<string[]>([]);

  /** Composer placeholder text. */
  placeholder = input<string>('Message the room');

  /** Disables sending (e.g. while disconnected from the socket). */
  disabled = input<boolean>(false);

  /** Shows/hides the close button in the header. */
  showCloseButton = input<boolean>(true);

  /** Allows page shells that already own the room header to avoid a duplicate header band. */
  showHeader = input<boolean>(true);

  /** Empty-state presentation: centered for panels, channel intro for full-page conversation views. */
  emptyStateVariant = input<'centered' | 'channel'>('centered');
  emptyStateTitle = input<string>('Start the conversation');
  emptyStateSubtitle = input<string>(
    'Messages, replies, and reactions will appear here in realtime.',
  );

  /** Emoji set for the reaction menu + composer picker. */
  emojis = input<string[]>(DEFAULT_CHAT_EMOJIS);

  /** Emitted with the final message text (reply prefix already applied) on Send. */
  readonly sendMessage = output<SendChatMessage>();

  /** Emitted when the user starts replying to a message. */
  readonly replyToMessage = output<ChatMessage>();

  /** Emitted when an emoji is picked or a reaction chip is toggled. */
  readonly reactToMessage = output<{ messageId: string; emoji: string }>();

  /** Emitted with the message id on delete. */
  readonly deleteMessage = output<string>();
  readonly editMessage = output<ChatMessage>();

  /** Emitted when the header close button is clicked. */
  readonly close = output<void>();

  private readonly sidebar = viewChild(ChatSidebarComponent);

  /** Id of the message whose reaction picker is open (at most one at a time). */
  protected readonly openReactionMenuId = signal<string | null>(null);

  /** The "Replying to …" preview shown above the composer. */
  protected readonly pendingReply = signal<ChatReplyPreview | null>(null);

  constructor() {
    // If the message being replied to disappears (deleted locally or via a
    // broadcast), drop the reply preview to match the previous behavior.
    effect(() => {
      const currentMessages = this.messages();
      const pending = this.pendingReply();
      if (pending && !currentMessages.some((message) => message.id === pending.messageId)) {
        this.pendingReply.set(null);
      }
    });
  }

  protected onClose(): void {
    this.close.emit();
  }

  protected onSend(text: string): void {
    const reply = this.pendingReply();
    this.pendingReply.set(null);
    this.sendMessage.emit({ text, replyTo: reply?.messageId ?? null });
  }

  protected onReply(message: ChatMessage): void {
    this.openReactionMenuId.set(null);
    this.pendingReply.set({
      messageId: message.id,
      authorName: message.author.name,
      text: message.text,
    });
    this.sidebar()?.closeComposerPopovers();
    this.sidebar()?.focusComposer();
    this.replyToMessage.emit(message);
  }

  protected onToggleReactionMenu(messageId: string): void {
    this.openReactionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  protected onReact(payload: { messageId: string; emoji: string }): void {
    this.openReactionMenuId.set(null);
    this.reactToMessage.emit(payload);
  }

  protected onDelete(messageId: string): void {
    this.openReactionMenuId.set(null);
    if (this.pendingReply()?.messageId === messageId) {
      this.pendingReply.set(null);
    }
    this.deleteMessage.emit(messageId);
  }

  protected onEdit(message: ChatMessage): void {
    this.openReactionMenuId.set(null);
    this.editMessage.emit(message);
  }

  protected onCancelReply(): void {
    this.pendingReply.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.openReactionMenuId()) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element &&
      !target.closest('[data-message-reaction-menu]') &&
      !target.closest('[data-message-react-button]')
    ) {
      this.openReactionMenuId.set(null);
    }
  }

  /** Programmatic scroll-to-newest for the host page (e.g. after history load / a new message). */
  scrollToNewest(smooth = false): void {
    this.sidebar()?.scrollToNewest(smooth);
  }

  /** True when the visible viewport is at (or near) the bottom of the message list. */
  isNearBottom(): boolean {
    return this.sidebar()?.isNearBottom() ?? true;
  }
}

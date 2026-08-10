import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { ChatBarComponent } from '../chat-bar/chat-bar.component';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import {
  DEFAULT_CHAT_EMOJIS,
  type ChatMessage,
  type ChatReplyPreview,
} from '../models/chat-message.model';

/**
 * Chat panel body: an optional info banner, the scrollable message list
 * (chat-message *ngFor) and the composer (chat-bar) with the jump-to-newest
 * button and reply preview. The header (title, subtitle, optional close icon,
 * plus page-specific `[chat-header-leading]` / `[chat-header-extra]` slots)
 * lives in `room-chat` so slotted content only needs to be projected once.
 *
 * Composed by `room-chat` — other pages should import `RoomChatComponent`, not
 * this one directly.
 */
@Component({
  selector: 'app-chat-sidebar',
  standalone: true,
  imports: [LobbyIconComponent, ChatMessageComponent, ChatBarComponent],
  templateUrl: './chat-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col',
  },
})
export class ChatSidebarComponent {
  infoBannerText = input<string | null>(null);
  emptyStateVariant = input<'centered' | 'channel'>('centered');
  emptyStateTitle = input<string>('Start the conversation');
  emptyStateSubtitle = input<string>(
    'Messages, replies, and reactions will appear here in realtime.',
  );
  channelLayout = input<boolean>(false);
  channelContext = input<string>('');
  messages = input<ChatMessage[]>([]);
  currentUserId = input<string>('');
  memberNames = input<string[]>([]);
  reactionMenuOpenMessageId = input<string | null>(null);
  replyPreview = input<ChatReplyPreview | null>(null);
  disabled = input<boolean>(false);
  placeholder = input<string>('Message the room');
  emojis = input<string[]>(DEFAULT_CHAT_EMOJIS);

  readonly send = output<string>();
  readonly reply = output<ChatMessage>();
  readonly toggleReactionMenu = output<string>();
  readonly react = output<{ messageId: string; emoji: string }>();
  readonly delete = output<string>();
  readonly edit = output<ChatMessage>();
  readonly cancelReply = output<void>();

  private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');
  private readonly chatBar = viewChild(ChatBarComponent);

  protected readonly showScrollToNewest = signal(false);

  /** How many new messages arrived while the user was scrolled up. */
  protected readonly unreadCount = signal(0);

  /** Whether the last scroll position was pinned to the bottom of the list. */
  private stickyBottom = false;

  /** Tracks the newest rendered message so loading older history does not jump the list. */
  private lastNewestMessageId: string | null = null;

  constructor() {
    effect(() => {
      const currentMessages = this.messages();
      const newestMessageId = currentMessages[currentMessages.length - 1]?.id ?? null;

      // Loading older history only prepends rows; the newest id stays the same,
      // so pagination does not unexpectedly throw the user back to the bottom.
      if (newestMessageId === this.lastNewestMessageId) {
        return;
      }

      const hadPreviousNewest = this.lastNewestMessageId !== null;
      this.lastNewestMessageId = newestMessageId;

      if (!newestMessageId) {
        this.stickyBottom = true;
        this.unreadCount.set(0);
        this.showScrollToNewest.set(false);
        return;
      }

      // A changed newest id means either the initial history just rendered, the
      // current user sent an optimistic message, or Realtime delivered a new
      // message. In all three cases keep the conversation pinned to the latest.
      this.scheduleScrollToNewest(hadPreviousNewest);
    });
  }

  protected showDateSeparator(index: number): boolean {
    const current = this.messages()[index];
    if (!current) return false;
    if (index === 0) return true;

    const previous = this.messages()[index - 1];
    return (
      new Date(previous.createdAt).toDateString() !== new Date(current.createdAt).toDateString()
    );
  }

  protected dateLabel(message: ChatMessage): string {
    const value = new Date(message.createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (value.toDateString() === today.toDateString()) return 'Today';
    if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return value.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: value.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
  }

  protected onMessagesScroll(): void {
    this.stickyBottom = this.isNearBottom();
    this.showScrollToNewest.set(!this.stickyBottom);
    if (this.stickyBottom) {
      this.unreadCount.set(0);
    }
  }

  protected jumpToNewestMessage(): void {
    this.scrollToNewest(true);
  }

  private scheduleScrollToNewest(smooth: boolean): void {
    // Effects run while Angular is reconciling the view. Waiting for the next
    // animation frame guarantees the newly-added message and scroll anchor are
    // in the DOM before we measure/scroll.
    if (typeof requestAnimationFrame === 'undefined') {
      queueMicrotask(() => this.scrollToNewest(smooth));
      return;
    }

    requestAnimationFrame(() => {
      if (this.scrollAnchor()) {
        this.scrollToNewest(smooth);
        return;
      }

      // Very first render can expose the viewChild one frame later.
      requestAnimationFrame(() => this.scrollToNewest(smooth));
    });
  }

  /** Public: move focus to the composer input (used when starting a reply). */
  focusComposer(): void {
    this.chatBar()?.focusInput();
  }

  /** Public: close the composer's emoji picker + mention dropdown. */
  closeComposerPopovers(): void {
    this.chatBar()?.closePopovers();
  }

  /** Public: scroll the message list to the newest message. */
  scrollToNewest(smooth = false): void {
    const el = this.scrollAnchor()?.nativeElement;
    if (!el) return;

    el.scrollIntoView({
      block: 'end',
      behavior: smooth ? 'smooth' : 'auto',
    });
    this.stickyBottom = true;
    this.unreadCount.set(0);
    this.showScrollToNewest.set(false);
  }

  /** Public: whether the visible viewport is at (or near) the bottom of the message list. */
  isNearBottom(): boolean {
    const el = this.messagesContainer()?.nativeElement;
    if (!el) return true;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= 56;
  }
}

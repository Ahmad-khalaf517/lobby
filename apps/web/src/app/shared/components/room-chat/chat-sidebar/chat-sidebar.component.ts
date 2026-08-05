import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ChatBarComponent } from '../chat-bar/chat-bar.component';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatReplyComponent } from '../chat-reply/chat-reply.component';
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
  imports: [ChatMessageComponent, ChatReplyComponent, ChatBarComponent],
  templateUrl: './chat-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col',
  },
})
export class ChatSidebarComponent {
  infoBannerText = input<string | null>(null);
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
  readonly cancelReply = output<void>();

  private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');
  private readonly chatBar = viewChild(ChatBarComponent);

  protected readonly showScrollToNewest = signal(false);

  protected onMessagesScroll(): void {
    this.showScrollToNewest.set(!this.isNearBottom());
  }

  protected jumpToNewestMessage(): void {
    this.scrollToNewest(true);
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

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Person } from '../../../shared/components/person-avatar/person.model';
import { UserPopoverAvatarComponent } from '../../../shared/components/user-popover/user-popover-avatar.component';
import {
  ChatReplyComponent,
  type ChatMessage,
  type ChatReplyPreview,
} from '../../../shared/components/room-chat';
import { MessageRowComponent } from '../components/message-row/message-row.component';
import { formatMessageTime } from '../messages.util';
import { DirectMessagesService } from '../messages.service';
import { FriendsService } from '../../friends/friends.service';
import { ProfilePopupService } from '../../profile/services/profile-popup.service';

/**
 * Direct messages page (routes `/messages`, `/messages/:friendId`). Renders the
 * mockup's DM layout: a conversation sidebar, the selected conversation (header
 * with Call button, message list, composer), unread badges and presence dots.
 *
 * The page is a thin composer over <app-direct-messages-service> — conversations
 * and message history load over the DMs REST API, and message actions (reply /
 * edit / delete / reactions) are wired here (edit/delete/reactions are local-only
 * until the backend ships those endpoints).
 */
@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [RouterLink, MessageRowComponent, ChatReplyComponent, UserPopoverAvatarComponent],
  templateUrl: './messages-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class MessagesPage {
  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  private readonly service = inject(DirectMessagesService);
  private readonly friendsService = inject(FriendsService);
  private readonly profilePopup = inject(ProfilePopupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly conversationRows = this.service.conversationRows;
  protected readonly totalUnread = this.service.totalUnread;
  protected readonly currentUserId = this.service.currentUserId;
  protected readonly conversationsLoading = this.service.loading;
  protected readonly conversationsError = this.service.error;

  protected readonly selectedFriendId = signal<string | null>(null);
  protected readonly seededPartner = signal<Person | null>(null);
  protected readonly draft = signal('');
  protected readonly pendingReply = signal<ChatReplyPreview | null>(null);
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly openReactionMenuId = signal<string | null>(null);
  protected readonly openError = signal<string | null>(null);
  protected readonly headerMenuOpen = signal(false);

  protected readonly selectedPartner = computed<Person | null>(() => {
    const friendId = this.selectedFriendId();
    if (!friendId) {
      return null;
    }
    // Prefer the canonical partner from the conversation list; fall back to the
    // person supplied via navigation state so the header renders instantly.
    const seeded = this.seededPartner();
    return this.service.partnerFor(friendId) ?? (seeded?.id === friendId ? seeded : null);
  });

  protected readonly selectedMessages = computed<ChatMessage[]>(() => {
    const friendId = this.selectedFriendId();
    return friendId ? this.service.messagesFor(friendId) : [];
  });

  /** Whether the current user has blocked the selected partner. */
  protected readonly currentPartnerBlocked = computed<boolean>(() => {
    const friendId = this.selectedFriendId();
    return friendId ? this.friendsService.isBlocked(friendId) : false;
  });

  private readonly messageListEl = viewChild<ElementRef<HTMLDivElement>>('messageList');
  private readonly composerInput = viewChild<ElementRef<HTMLInputElement>>('composerInput');

  constructor() {
    void this.service.loadConversations();
    void this.friendsService.ensureLoaded();

    // A navigation from the Friends page carries the friend so the chat header
    // shows immediately instead of flashing the empty state while loading.
    const state = this.router.getCurrentNavigation()?.extras.state;
    if (state && typeof state['person']?.id === 'string') {
      this.seededPartner.set(state['person'] as Person);
    }

    this.route.paramMap.subscribe((params) => {
      const friendId = params.get('friendId');
      if (!friendId) {
        this.selectedFriendId.set(null);
        return;
      }
      this.selectedFriendId.set(friendId);
      void this.openConversation(friendId);
    });
  }

  private async openConversation(friendId: string): Promise<void> {
    this.openError.set(null);
    try {
      await this.service.openConversation(friendId);
      this.openReactionMenuId.set(null);
      this.editingMessageId.set(null);
      this.pendingReply.set(null);
      this.scrollToBottom();
    } catch {
      this.openError.set('Could not open this conversation.');
    }
  }

  protected conversationRowClass(friendId: string): string {
    const selected = friendId === this.selectedFriendId();
    return [
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
      selected ? 'bg-[#16161d]' : 'hover:bg-[#131318]',
    ].join(' ');
  }

  protected selectConversation(friendId: string): void {
    if (friendId === this.selectedFriendId()) {
      return;
    }
    this.headerMenuOpen.set(false);
    void this.router.navigate(['/app/messages', friendId]);
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected send(): void {
    const friendId = this.selectedFriendId();
    if (!friendId || this.currentPartnerBlocked()) {
      return;
    }
    const text = this.draft().trim();
    if (!text) {
      return;
    }
    const reply = this.pendingReply();
    void this.service
      .send(
        friendId,
        text,
        reply
          ? { messageId: reply.messageId, authorName: reply.authorName, text: reply.text }
          : undefined,
      )
      .then(() => this.scrollToBottom());
    this.draft.set('');
    this.pendingReply.set(null);
  }

  protected onReply(message: ChatMessage): void {
    this.openReactionMenuId.set(null);
    this.pendingReply.set({
      messageId: message.id,
      authorName: message.author.name,
      text: message.text,
    });
    this.composerInput()?.nativeElement.focus();
  }

  protected onCancelReply(): void {
    this.pendingReply.set(null);
  }

  protected onEdit(message: ChatMessage): void {
    this.openReactionMenuId.set(null);
    this.editingMessageId.set(message.id);
  }

  protected onSaveEdit(payload: { messageId: string; text: string }): void {
    const friendId = this.selectedFriendId();
    if (friendId) {
      this.service.editMessage(friendId, payload.messageId, payload.text);
    }
    this.editingMessageId.set(null);
  }

  protected onCancelEdit(): void {
    this.editingMessageId.set(null);
  }

  protected onDelete(messageId: string): void {
    const friendId = this.selectedFriendId();
    if (!friendId) {
      return;
    }
    if (this.pendingReply()?.messageId === messageId) {
      this.pendingReply.set(null);
    }
    this.service.deleteMessage(friendId, messageId);
  }

  protected onReact(payload: { messageId: string; emoji: string }): void {
    const friendId = this.selectedFriendId();
    if (!friendId) {
      return;
    }
    this.openReactionMenuId.set(null);
    this.service.toggleReaction(friendId, payload.messageId, payload.emoji);
  }

  protected onToggleReactionMenu(messageId: string): void {
    this.openReactionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  protected isEditing(messageId: string): boolean {
    return this.editingMessageId() === messageId;
  }

  protected isReactionOpen(messageId: string): boolean {
    return this.openReactionMenuId() === messageId;
  }

  /** Whether the selected conversation's history is still being fetched. */
  protected historyLoading(): boolean {
    const friendId = this.selectedFriendId();
    return friendId ? (this.service.historyLoadingRecord()[friendId] ?? false) : false;
  }

  protected statusLabel(person: Person): string {
    if (person.status === 'online') {
      return 'Online';
    }
    return person.lastSeen ? `Seen ${person.lastSeen}` : 'Offline';
  }

  protected formatTime(iso: string): string {
    return formatMessageTime(iso);
  }

  protected goBackToList(): void {
    void this.router.navigate(['/app/messages']);
  }

  protected openMyProfile(): void {
    const userId = this.currentUserId();
    if (userId) {
      this.profilePopup.open(userId);
    }
  }

  /** Call button — UI only until the backend calling integration ships. */
  protected onCall(): void {
    return;
  }

  protected toggleHeaderMenu(): void {
    this.headerMenuOpen.update((open) => !open);
  }

  /** Remove the current friend — leaves the chat closed. */
  protected removeCurrentFriend(): void {
    const friendId = this.selectedFriendId();
    this.headerMenuOpen.set(false);
    if (!friendId) {
      return;
    }
    const friendshipId = this.friendsService
      .friends()
      .find((friend) => friend.id === friendId)?.friendshipId;
    if (friendshipId) {
      void this.friendsService.removeFriend(friendshipId);
    }
    void this.router.navigate(['/app/messages']);
  }

  /** Delete all messages in the current chat (keeps the conversation + friend). */
  protected deleteCurrentChat(): void {
    const friendId = this.selectedFriendId();
    this.headerMenuOpen.set(false);
    if (friendId) {
      void this.service.clearChatHistory(friendId);
    }
  }

  /** Block the current user and stay in the chat (composer disabled, menu shows Unblock). */
  protected blockCurrentUser(): void {
    const friendId = this.selectedFriendId();
    this.headerMenuOpen.set(false);
    this.pendingReply.set(null);
    if (friendId) {
      void this.friendsService.block(friendId);
    }
  }

  /** Unblock the current user — re-enables messaging. */
  protected unblockCurrentUser(): void {
    const friendId = this.selectedFriendId();
    this.headerMenuOpen.set(false);
    if (friendId) {
      void this.friendsService.unblock(friendId);
    }
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.openReactionMenuId() && !this.headerMenuOpen()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (
      !target.closest('[data-message-reaction-menu]') &&
      !target.closest('[data-message-react-button]')
    ) {
      this.openReactionMenuId.set(null);
    }
    if (!target.closest('[data-message-header-menu]')) {
      this.headerMenuOpen.set(false);
    }
  }

  private scrollToBottom(): void {
    const element = this.messageListEl()?.nativeElement;
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }
}

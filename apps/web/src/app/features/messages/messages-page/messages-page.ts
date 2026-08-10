import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CallStatusResponseSchema,
  CallTokenResponseSchema,
  type CallStatusResponse,
} from '@lobby/shared';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../../core/auth-http-context';
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
import { SessionScopeService } from '../../../core/session-scope.service';
import {
  CallControlBarComponent,
  CallParticipantsSidebarComponent,
  CallStageComponent,
  LiveKitCallService,
  VoiceParticipantTileComponent,
} from '../../../shared/components/call-room';
import { DashboardStore } from '../../dashboard/services/dashboard.store';
import { AuthService } from '../../auth/services/auth';

/**
 * Direct messages page (routes `/messages`, `/messages/:friendId`). Renders the
 * mockup's DM layout: a conversation sidebar, the selected conversation (header
 * with Call button, message list, composer), unread badges and presence dots.
 *
 * The page composes the direct-Supabase DM store with the shared LiveKit call
 * service. NestJS only creates/discovers conversations and authorizes derived
 * two-person call rooms; media and message persistence stay in their existing
 * dedicated layers.
 */
@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [
    RouterLink,
    MessageRowComponent,
    ChatReplyComponent,
    UserPopoverAvatarComponent,
    CallControlBarComponent,
    CallParticipantsSidebarComponent,
    CallStageComponent,
    VoiceParticipantTileComponent,
  ],
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly http = inject(HttpClient);
  private readonly dashboardStore = inject(DashboardStore);
  private readonly auth = inject(AuthService);
  protected readonly call = inject(LiveKitCallService);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

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
  protected readonly dmCallStatus = signal<CallStatusResponse | null>(null);
  protected readonly callJoining = signal(false);
  protected readonly callError = signal<string | null>(null);
  protected readonly callParticipantsOpen = signal(false);
  private readonly activeDmCallConversationId = signal<string | null>(null);
  private callRevision = 0;
  private callStatusTimer: ReturnType<typeof setInterval> | null = null;

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
  protected readonly historyHasMore = computed(() => {
    const friendId = this.selectedFriendId();
    return friendId ? (this.service.historyHasMoreRecord()[friendId] ?? false) : false;
  });
  protected readonly selectedConversation = computed(() => {
    const friendId = this.selectedFriendId();
    return friendId ? (this.service.conversationFor(friendId) ?? null) : null;
  });
  protected readonly isInDmCallHere = computed(
    () =>
      this.call.joined() &&
      this.activeDmCallConversationId() === this.selectedConversation()?.conversationId,
  );
  protected readonly dmCallIsLive = computed(() => this.dmCallStatus()?.active === true);
  protected readonly currentUserName = computed(() => {
    const name = this.auth.user()?.userMetadata['name'];
    return typeof name === 'string' && name.trim() ? name.trim() : 'You';
  });
  protected readonly callParticipants = this.call.participants;
  protected readonly activeScreenShare = this.call.activeScreenShare;

  /** Whether the current user has blocked the selected partner. */
  protected readonly currentPartnerBlocked = computed<boolean>(() => {
    const friendId = this.selectedFriendId();
    return friendId ? this.friendsService.isBlocked(friendId) : false;
  });

  private readonly messageListEl = viewChild<ElementRef<HTMLDivElement>>('messageList');
  private readonly composerInput = viewChild<ElementRef<HTMLInputElement>>('composerInput');
  private lastAutoScrollConversationId: string | null = null;
  private lastAutoScrollMessageId: string | null = null;

  constructor() {
    const unregister = this.sessionScope.registerCleanup(() => this.resetSelections());
    this.destroyRef.onDestroy(unregister);
    void this.service.loadConversations();
    void this.friendsService.ensureLoaded();

    // Keep DMs pinned to the latest message too. Tracking the newest message id
    // (rather than the array length) means loading older history does not cause
    // a jump back down, while optimistic sends and Realtime inserts do.
    effect(() => {
      const friendId = this.selectedFriendId();
      const messages = this.selectedMessages();
      const newestMessageId = messages[messages.length - 1]?.id ?? null;
      const conversationChanged = friendId !== this.lastAutoScrollConversationId;

      if (conversationChanged) {
        this.lastAutoScrollConversationId = friendId;
        this.lastAutoScrollMessageId = newestMessageId;
        if (friendId && newestMessageId) this.scheduleScrollToBottom(false);
        return;
      }

      if (!newestMessageId || newestMessageId === this.lastAutoScrollMessageId) {
        return;
      }

      this.lastAutoScrollMessageId = newestMessageId;
      this.scheduleScrollToBottom(true);
    });

    // A navigation from the Friends page carries the friend so the chat header
    // shows immediately instead of flashing the empty state while loading.
    const state = this.router.getCurrentNavigation()?.extras.state;
    if (state && typeof state['person']?.id === 'string') {
      this.seededPartner.set(state['person'] as Person);
    }

    this.route.paramMap.subscribe((params) => {
      const friendId = params.get('friendId');
      this.stopCallStatusPolling();
      this.dmCallStatus.set(null);
      this.callError.set(null);
      const previousCallConversation = this.activeDmCallConversationId();
      const nextConversation = friendId ? this.service.conversationFor(friendId) : null;
      if (
        previousCallConversation &&
        (!nextConversation || nextConversation.conversationId !== previousCallConversation)
      ) {
        void this.leaveDmCall();
      }
      this.service.setActiveConversation(friendId);
      if (!friendId) {
        this.selectedFriendId.set(null);
        return;
      }
      this.selectedFriendId.set(friendId);
      void this.openConversation(friendId);
    });

    this.destroyRef.onDestroy(() => {
      this.service.setActiveConversation(null);
      this.stopCallStatusPolling();
      if (this.activeDmCallConversationId()) void this.call.disconnect();
    });
  }

  private resetSelections(): void {
    this.service.setActiveConversation(null);
    this.selectedFriendId.set(null);
    this.seededPartner.set(null);
    this.draft.set('');
    this.pendingReply.set(null);
    this.editingMessageId.set(null);
    this.openReactionMenuId.set(null);
    this.openError.set(null);
    this.headerMenuOpen.set(false);
    this.callRevision += 1;
    this.stopCallStatusPolling();
    this.activeDmCallConversationId.set(null);
    this.dmCallStatus.set(null);
    this.callJoining.set(false);
    this.callError.set(null);
    this.callParticipantsOpen.set(false);
  }

  private async openConversation(friendId: string): Promise<void> {
    this.openError.set(null);
    try {
      await this.service.openConversation(friendId);
      this.startCallStatusPolling();
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
      'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition',
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
      .then(() => this.scrollToBottom())
      .catch(() => this.openError.set('Could not send that message.'));
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
      void this.service.editMessage(friendId, payload.messageId, payload.text);
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
    void this.service
      .deleteMessage(friendId, messageId)
      .catch(() => this.openError.set('Could not delete that message.'));
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

  protected loadOlder(): void {
    const friendId = this.selectedFriendId();
    if (friendId) void this.service.loadOlder(friendId);
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

  protected onCall(): void {
    void this.joinDmCall();
  }

  protected async joinDmCall(): Promise<void> {
    if (this.callJoining() || this.isInDmCallHere() || this.currentPartnerBlocked()) return;
    const scope = this.sessionScope.capture();
    const conversation = this.selectedConversation();
    if (!scope.userId || !conversation) return;

    const revision = ++this.callRevision;
    this.callJoining.set(true);
    this.callError.set(null);
    this.call.dismissError();
    try {
      const raw = await firstValueFrom(
        this.http.post<unknown>(
          `${this.apiUrl}/dm-conversations/${conversation.conversationId}/call-token`,
          {},
        ),
      );
      const response = CallTokenResponseSchema.parse(raw);
      if (!this.sessionScope.isCurrent(scope) || revision !== this.callRevision) return;

      if (this.dashboardStore.activeCall()) this.dashboardStore.clearActiveCall();
      await this.call.connect(response);
      if (!this.sessionScope.isCurrent(scope) || revision !== this.callRevision) {
        if (this.call.roomName() === response.roomName) await this.call.disconnect();
        return;
      }
      this.activeDmCallConversationId.set(conversation.conversationId);
      this.dmCallStatus.set({
        active: true,
        participants: this.call.participants().length,
        maxParticipants: 2,
      });
    } catch (error: unknown) {
      if (this.sessionScope.isCurrent(scope) && revision === this.callRevision) {
        this.callError.set(describeDmCallError(error));
      }
    } finally {
      if (revision === this.callRevision) this.callJoining.set(false);
    }
  }

  protected async leaveDmCall(): Promise<void> {
    this.callRevision += 1;
    const conversationId = this.activeDmCallConversationId();
    this.activeDmCallConversationId.set(null);
    this.callParticipantsOpen.set(false);
    await this.call.disconnect();
    if (conversationId === this.selectedConversation()?.conversationId) {
      await this.refreshDmCallStatus();
    }
  }

  protected toggleDmMic(): void {
    void this.call.toggleMic();
  }

  protected toggleDmScreenShare(): void {
    void this.call.toggleScreenShare();
  }

  private startCallStatusPolling(): void {
    this.stopCallStatusPolling();
    void this.refreshDmCallStatus();
    this.callStatusTimer = setInterval(() => void this.refreshDmCallStatus(), 3_000);
  }

  private stopCallStatusPolling(): void {
    if (this.callStatusTimer) clearInterval(this.callStatusTimer);
    this.callStatusTimer = null;
  }

  private async refreshDmCallStatus(): Promise<void> {
    const scope = this.sessionScope.capture();
    const conversation = this.selectedConversation();
    if (!scope.userId || !conversation) return;
    if (this.isInDmCallHere()) {
      this.dmCallStatus.set({
        active: true,
        participants: this.call.participants().length,
        maxParticipants: 2,
      });
      return;
    }
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(
          `${this.apiUrl}/dm-conversations/${conversation.conversationId}/call-status`,
          { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
        ),
      );
      const status = CallStatusResponseSchema.parse(raw);
      if (
        this.sessionScope.isCurrent(scope) &&
        this.selectedConversation()?.conversationId === conversation.conversationId
      ) {
        this.dmCallStatus.set(status);
      }
    } catch {
      // Keep the last confirmed status through transient API/LiveKit failures.
    }
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
      void this.service
        .clearChatHistory(friendId)
        .catch(() => this.openError.set('Could not clear this conversation.'));
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

  private scheduleScrollToBottom(smooth = false): void {
    if (typeof requestAnimationFrame === 'undefined') {
      queueMicrotask(() => this.scrollToBottom(smooth));
      return;
    }
    requestAnimationFrame(() => this.scrollToBottom(smooth));
  }

  private scrollToBottom(smooth = false): void {
    const element = this.messageListEl()?.nativeElement;
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
}

function describeDmCallError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const response = (error as Record<string, unknown>)['error'];
    if (typeof response === 'object' && response !== null) {
      const message = (response as Record<string, unknown>)['message'];
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Could not join this call. Please try again.';
}

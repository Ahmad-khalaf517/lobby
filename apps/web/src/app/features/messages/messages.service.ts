import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  DmConversationSchema,
  DmListResponseSchema,
  DmMessageHistorySchema,
  DmMessageSchema,
  UserProfileSchema,
  type DmConversation,
  type DmMessage,
  type UserProfile,
} from '@lobby/shared';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/services/auth';
import { SupabaseSessionService } from '../../core/supabase/supabase-session.service';
import { SessionScopeService, type SessionScope } from '../../core/session-scope.service';
import type { DmConversationRow, DmMessageRow } from '../../core/supabase/database.types';
import { ToastService } from '../../core/toast/toast.service';
import type { Person } from '../../shared/components/person-avatar/person.model';
import { personFromProfile } from '../../shared/components/person-avatar/person.util';
import type { ChatMessage, ChatReplyPreview, ChatUser } from '../../shared/components/room-chat';
import { initialsFromName } from '../../shared/components/room-chat';
import type { Conversation } from './messages.models';

/**
 * Direct messages feature state — backed by the DMs REST API for
 * reads/writes, plus a Supabase Realtime subscription (mirroring
 * GuestChannelStore's pattern) so messages/conversations from the other
 * participant show up live instead of only on next fetch.
 */
@Injectable({ providedIn: 'root' })
export class DirectMessagesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly toast = inject(ToastService);
  private readonly ngZone = inject(NgZone);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly conversationsSignal = signal<Conversation[]>([]);
  private readonly messagesSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  /** The conversation currently open on screen — no "new message" toast fires for it while focused. */
  private readonly activeConversationSignal = signal<string | null>(null);

  private realtimeChannel: RealtimeChannel | null = null;

  /** The signed-in user's id — own messages / "You" styling. */
  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /** Sidebar rows, sorted most-recent-first, with partner + last-message preview. */
  readonly conversationRows = computed<Conversation[]>(() =>
    [...this.conversationsSignal()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
  );

  readonly totalUnread = computed(() =>
    this.conversationRows().reduce((sum, row) => sum + row.unread, 0),
  );

  private myProfile: UserProfile | null = null;
  private myProfilePromise: Promise<UserProfile> | null = null;

  /** User ids whose history was already fetched at least once (cache flag). */
  private historyLoaded = new Set<string>();

  /** Per-conversation flag while its history is being fetched over the wire. */
  private readonly historyLoadingSignal = signal<Record<string, boolean>>({});
  readonly historyLoadingRecord = this.historyLoadingSignal.asReadonly();

  constructor() {
    this.sessionScope.registerCleanup(() => this.reset());
    // Connects once a session exists, regardless of which page is open, so a
    // message/friend event elsewhere in the app can still surface a toast.
    effect(() => {
      const userId = this.currentUserId();
      if (userId) {
        void this.loadConversations();
        this.subscribeRealtime();
      } else {
        void this.reset();
      }
    });
  }

  /** Tracks which conversation is on screen right now, so incoming messages for it don't also toast. */
  setActiveConversation(userId: string | null): void {
    this.activeConversationSignal.set(userId);
    if (userId) this.markRead(userId);
  }

  /** Fetch the sidebar conversation list. */
  async loadConversations(): Promise<void> {
    const scope = this.requireScope();
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const response = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/dms`));
      const rows = DmListResponseSchema.parse(response).map(toConversation);
      this.assertCurrent(scope);
      // Preserve locally-tracked unread counts — the REST list doesn't know
      // about messages that arrived over realtime since the last full load.
      const unreadById = new Map(this.conversationsSignal().map((c) => [c.friendId, c.unread]));
      this.conversationsSignal.set(
        rows.map((row) => ({ ...row, unread: unreadById.get(row.friendId) ?? row.unread })),
      );
    } catch {
      if (this.sessionScope.isCurrent(scope)) {
        this.errorSignal.set('Could not load conversations.');
      }
    } finally {
      if (this.sessionScope.isCurrent(scope)) this.loadingSignal.set(false);
    }
  }

  /**
   * Open / get-or-create the conversation and make its history available.
   *
   * When the history was already fetched during this session it's served
   * instantly from the in-memory cache and re-fetched silently in the background,
   * so navigating back to a chat is immediate.
   */
  async openConversation(userId: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = await this.ensureConversation(userId);
    this.assertCurrent(scope);
    const cached = this.messagesSignal()[userId];

    if (cached && cached.length > 0 && this.historyLoaded.has(userId)) {
      this.setHistoryLoading(userId, false);
      void this.fetchHistory(userId, conversation, scope).catch(() => undefined);
      return;
    }

    this.setHistoryLoading(userId, true);
    try {
      await this.fetchHistory(userId, conversation, scope);
    } finally {
      if (this.sessionScope.isCurrent(scope)) this.setHistoryLoading(userId, false);
    }
  }

  /** Fetch + store a conversation's history, marking it as cached afterward. */
  private async fetchHistory(
    userId: string,
    conversation: Conversation,
    scope: SessionScope,
  ): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/dms/${conversation.conversationId}/messages`),
    );
    const history = DmMessageHistorySchema.parse(response);

    const [selfAuthor, partnerAuthor] = await Promise.all([
      this.selfAuthor(scope),
      authorFromPerson(conversation.partner),
    ]);
    this.assertCurrent(scope);
    const byId = new Map(history.map((message) => [message.id, message]));
    const authorFor = (senderId: string): ChatUser =>
      senderId === this.currentUserId() ? selfAuthor : partnerAuthor;

    const mapped = history.map((message) => {
      const target = message.replyToMessageId ? byId.get(message.replyToMessageId) : undefined;
      const reply: ChatReplyPreview | null = message.replyToMessageId
        ? {
            messageId: message.replyToMessageId,
            authorName: target ? authorFor(target.senderId).name : 'Someone',
            text: target ? target.body : 'Original message unavailable',
          }
        : null;
      return this.toChatMessage(message, authorFor(message.senderId), reply);
    });

    this.messagesSignal.update((store) => ({ ...store, [userId]: mapped }));
    this.historyLoaded.add(userId);
    this.markRead(userId);
  }

  private setHistoryLoading(userId: string, value: boolean): void {
    this.historyLoadingSignal.update((record) => ({ ...record, [userId]: value }));
  }

  conversationFor(userId: string): Conversation | undefined {
    return this.conversationsSignal().find((conversation) => conversation.friendId === userId);
  }

  partnerFor(userId: string): Person | undefined {
    return this.conversationsSignal().find((conversation) => conversation.friendId === userId)
      ?.partner;
  }

  messagesFor(userId: string): ChatMessage[] {
    return this.messagesSignal()[userId] ?? [];
  }

  /** Send a message (optionally a reply quoting another message). Persists via POST. */
  async send(userId: string, text: string, reply: ChatReplyPreview | null = null): Promise<void> {
    const scope = this.requireScope();
    const content = text.trim();
    if (!content) {
      return;
    }

    const conversation = await this.ensureConversation(userId);
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/dms/${conversation.conversationId}/messages`, {
        body: content,
        replyToMessageId: reply?.messageId ?? null,
      }),
    );
    const created = DmMessageSchema.parse(response);
    this.assertCurrent(scope);

    const author =
      created.senderId === this.currentUserId()
        ? await this.selfAuthor(scope)
        : await authorFromPerson(conversation.partner);

    const message = this.toChatMessage(created, author, reply);
    this.assertCurrent(scope);

    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: [...(store[userId] ?? []), message],
    }));
    this.bumpConversation(userId, created.body, created.createdAt);
    this.markRead(userId);
  }

  /** Persists an edit via PATCH, then applies it locally (rolled back on failure). */
  async editMessage(userId: string, messageId: string, newText: string): Promise<void> {
    const scope = this.requireScope();
    const content = newText.trim();
    const conversation = this.conversationFor(userId);
    const previous = this.messagesSignal()[userId] ?? [];
    const current = previous.find((message) => message.id === messageId);
    if (!content || !conversation || !current || current.text === content) {
      return;
    }

    this.applyMessageEdit(userId, messageId, content);
    try {
      await firstValueFrom(
        this.http.patch<unknown>(
          `${this.apiUrl}/dms/${conversation.conversationId}/messages/${messageId}`,
          { body: content },
        ),
      );
      this.assertCurrent(scope);
    } catch {
      // Roll back to the pre-edit text on failure.
      if (this.sessionScope.isCurrent(scope)) {
        this.messagesSignal.update((store) => ({ ...store, [userId]: previous }));
      }
    }
  }

  private applyMessageEdit(userId: string, messageId: string, content: string): void {
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: (store[userId] ?? []).map((message) =>
        message.id === messageId ? { ...message, text: content, edited: true } : message,
      ),
    }));
  }

  /** Remove a message from local state — local-only until the API ships. */
  deleteMessage(userId: string, messageId: string): void {
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: (store[userId] ?? []).filter((message) => message.id !== messageId),
    }));
  }

  /** Toggle the current user's reaction — persists via PUT/DELETE reaction APIs. */
  async toggleReaction(userId: string, messageId: string, emoji: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    const current = (this.messagesSignal()[userId] ?? []).find(
      (message) => message.id === messageId,
    );
    if (!conversation || !current) {
      return;
    }

    const next = current.ownReaction === emoji ? null : emoji;
    const url = `${this.apiUrl}/dms/${conversation.conversationId}/messages/${messageId}/reaction`;

    try {
      if (next === null) {
        await firstValueFrom(this.http.delete<unknown>(url));
      } else {
        await firstValueFrom(this.http.put<unknown>(url, { emoji: next }));
      }
    } catch {
      return; // Keep the previous state on failure.
    }

    this.assertCurrent(scope);
    this.applyLocalReaction(userId, messageId, next);
  }

  private applyLocalReaction(userId: string, messageId: string, ownReaction: string | null): void {
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: (store[userId] ?? []).map((message) =>
        message.id === messageId
          ? {
              ...message,
              ownReaction,
              reactions: ownReaction ? [{ emoji: ownReaction, count: 1, reactedByMe: true }] : [],
            }
          : message,
      ),
    }));
  }

  /** Clear the unread badge for a conversation — local state only. */
  markRead(userId: string): void {
    this.conversationsSignal.update((list) =>
      list.map((conversation) =>
        conversation.friendId === userId ? { ...conversation, unread: 0 } : conversation,
      ),
    );
  }

  /**
   * Clear a conversation's history (keeps the chat + friend) via
   * `DELETE /dms/:conversationId/messages`, then empty the local message list.
   */
  async clearChatHistory(userId: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    if (conversation) {
      try {
        await firstValueFrom(
          this.http.delete<unknown>(`${this.apiUrl}/dms/${conversation.conversationId}/messages`),
        );
      } catch {
        // The messages are cleared locally regardless.
      }
    }
    this.assertCurrent(scope);
    this.messagesSignal.update((store) => ({ ...store, [userId]: [] }));
    this.conversationsSignal.update((list) =>
      list.map((entry) => (entry.friendId === userId ? { ...entry, preview: null } : entry)),
    );
  }

  private async ensureConversation(userId: string): Promise<Conversation> {
    const scope = this.requireScope();
    const existing = this.conversationFor(userId);
    if (existing) {
      return existing;
    }

    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/dms`, { userId }),
    );
    const apiConversation = DmConversationSchema.parse(response);
    this.assertCurrent(scope);
    const conversation = toConversation(apiConversation);
    this.upsertConversation(conversation);
    return conversation;
  }

  private upsertConversation(conversation: Conversation): void {
    this.conversationsSignal.update((list) => {
      const next = list.filter((entry) => entry.friendId !== conversation.friendId);
      return [conversation, ...next];
    });
  }

  private bumpConversation(userId: string, preview: string, lastMessageAt: string): void {
    this.conversationsSignal.update((list) =>
      list.map((conversation) =>
        conversation.friendId === userId
          ? { ...conversation, preview, lastMessageAt }
          : conversation,
      ),
    );
  }

  private async selfAuthor(scope: SessionScope): Promise<ChatUser> {
    const profile = await this.ensureMyProfile(scope);
    this.assertCurrent(scope);
    return {
      id: this.currentUserId(),
      name: profile.displayName,
      avatarUrl: profile.avatarUrl,
      initials: initialsFromName(profile.displayName),
    };
  }

  private toChatMessage(
    message: DmMessage,
    author: ChatUser,
    reply: ChatReplyPreview | null = null,
  ): ChatMessage {
    return {
      id: message.id,
      author,
      text: message.body,
      createdAt: message.createdAt,
      reactions: message.reactionEmoji
        ? [{ emoji: message.reactionEmoji, count: 1, reactedByMe: false }]
        : [],
      ownReaction: null,
      reply,
      edited: false,
      deleted: false,
      pending: false,
      failed: false,
    };
  }

  private async ensureMyProfile(scope: SessionScope): Promise<UserProfile> {
    if (this.myProfile) {
      return this.myProfile;
    }
    this.myProfilePromise ??= (async () => {
      const response = await firstValueFrom(
        this.http.get<unknown>(`${this.apiUrl}/users/${scope.userId}/profile`),
      );
      return UserProfileSchema.parse(response);
    })();
    try {
      const profile = await this.myProfilePromise;
      this.assertCurrent(scope);
      this.myProfile = profile;
      return this.myProfile;
    } catch (error) {
      this.myProfilePromise = null;
      throw error;
    }
  }

  // -------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------

  private subscribeRealtime(): void {
    if (this.realtimeChannel) return;

    // Realtime silently delivers nothing if direct reads aren't actually
    // permitted (missing RLS policy or GRANT SELECT) — this is the same
    // prerequisite postgres_changes needs, so it's a fast, direct way to
    // confirm that root cause instead of guessing from silence alone.
    void this.supabaseSession.client
      .from('dm_messages')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        if (error) {
          console.error(
            '[DirectMessagesService] Direct read of dm_messages failed — realtime needs the ' +
              'same access. Check RLS SELECT policies and GRANT SELECT ... TO authenticated.',
            error,
          );
        }
      });

    // Supabase Realtime's WebSocket may fire its callbacks outside Angular's
    // zone (depending on when the client's socket was constructed relative to
    // zone.js patching it) — wrapping in ngZone.run() guarantees change
    // detection actually runs after these signal writes instead of silently
    // leaving the view stale until some unrelated zone-tracked event happens.
    this.realtimeChannel = this.supabaseSession.client
      .channel(`dms:${this.currentUserId()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        (payload) =>
          this.ngZone.run(() => void this.handleIncomingMessage(payload.new as DmMessageRow)),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'dm_messages' },
        (payload) =>
          this.ngZone.run(() => this.handleMessageDeleted(payload.old as { id: string })),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_conversations' },
        (payload) =>
          this.ngZone.run(() => void this.handleNewConversation(payload.new as DmConversationRow)),
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(
            `[DirectMessagesService] Realtime subscription failed (${status}). ` +
              'Check that RLS SELECT policies exist on dm_messages/dm_conversations for the ' +
              'authenticated role — enabling the realtime publication alone is not enough.',
            error,
          );
        }
      });
  }

  private async reset(): Promise<void> {
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    if (channel) await this.supabaseSession.client.removeChannel(channel).catch(() => undefined);
    this.historyLoaded.clear();
    this.conversationsSignal.set([]);
    this.messagesSignal.set({});
    this.historyLoadingSignal.set({});
    this.activeConversationSignal.set(null);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
    this.myProfile = null;
    this.myProfilePromise = null;
    this.toast.dismissNotifications();
  }

  private async handleIncomingMessage(row: DmMessageRow): Promise<void> {
    const scope = this.requireScope();
    if (row.sender_id === scope.userId) return; // my own send already applied it optimistically

    let conversation = this.conversationsSignal().find(
      (c) => c.conversationId === row.conversation_id,
    );
    if (!conversation) {
      await this.loadConversations();
      this.assertCurrent(scope);
      conversation = this.conversationsSignal().find(
        (c) => c.conversationId === row.conversation_id,
      );
      if (!conversation) return;
    }

    const userId = conversation.friendId;
    const dmMessage = dmMessageFromRow(row);
    const author = await authorFromPerson(conversation.partner);
    const reply = this.resolveReplyFromCache(userId, dmMessage.replyToMessageId);
    const message = this.toChatMessage(dmMessage, author, reply);
    this.assertCurrent(scope);

    // Append unconditionally — fetchHistory() always fully replaces this
    // array when a conversation is opened, so there's no risk of this
    // creating a stale/incomplete list even if history was never loaded yet.
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: [...(store[userId] ?? []), message],
    }));
    this.bumpConversation(userId, dmMessage.body, dmMessage.createdAt);

    const isOpenAndFocused = this.activeConversationSignal() === userId && document.hasFocus();
    if (isOpenAndFocused) {
      this.markRead(userId);
      return;
    }

    this.conversationsSignal.update((list) =>
      list.map((entry) =>
        entry.friendId === userId ? { ...entry, unread: entry.unread + 1 } : entry,
      ),
    );
    this.toast.notify(message.text, {
      title: author.name,
      avatarUrl: author.avatarUrl,
      onClick: () => void this.router.navigate(['/app/messages', userId]),
    });
  }

  private handleMessageDeleted(old: { id: string }): void {
    // With RLS enabled, Supabase DELETE payloads may contain only the primary
    // key even when replica identity is FULL. Remove the globally unique
    // message id from every loaded conversation instead of depending on an
    // unavailable conversation_id or exposing full deleted rows to Realtime.
    this.messagesSignal.update((store) =>
      Object.fromEntries(
        Object.entries(store).map(([userId, messages]) => [
          userId,
          messages.filter((message) => message.id !== old.id),
        ]),
      ),
    );

    // Refresh sidebar previews because the deleted message may have been the
    // most recent message in its conversation.
    void this.loadConversations().catch(() => undefined);
  }

  private async handleNewConversation(row: DmConversationRow): Promise<void> {
    const scope = this.requireScope();
    const currentUserId = scope.userId;
    if (row.user_a_id !== currentUserId && row.user_b_id !== currentUserId) return;
    if (this.conversationsSignal().some((c) => c.conversationId === row.id)) return;
    await this.loadConversations();
    this.assertCurrent(scope);
  }

  private requireScope(): SessionScope {
    const scope = this.sessionScope.capture();
    if (!scope.userId) throw new Error('No authenticated session.');
    return scope;
  }

  private assertCurrent(scope: SessionScope): void {
    if (!this.sessionScope.isCurrent(scope)) throw new Error('The authenticated session changed.');
  }

  private resolveReplyFromCache(
    userId: string,
    replyToMessageId: string | null,
  ): ChatReplyPreview | null {
    if (!replyToMessageId) return null;
    const target = (this.messagesSignal()[userId] ?? []).find(
      (message) => message.id === replyToMessageId,
    );
    if (!target) {
      return {
        messageId: replyToMessageId,
        authorName: 'Someone',
        text: 'Original message unavailable',
      };
    }
    return {
      messageId: target.id,
      authorName: target.author.name,
      text: target.deleted ? 'Message deleted' : target.text,
    };
  }
}

function toConversation(api: DmConversation): Conversation {
  return {
    friendId: api.user.userId,
    conversationId: api.conversationId,
    unread: 0,
    lastMessageAt: api.lastMessage?.createdAt ?? api.updatedAt,
    preview: api.lastMessage?.body ?? null,
    partner: personFromProfile(api.user),
  };
}

function dmMessageFromRow(row: DmMessageRow): DmMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.content,
    reactionEmoji: row.reaction_emoji,
    replyToMessageId: row.reply_to,
    createdAt: row.created_at,
  };
}

function authorFromPerson(person: Person): Promise<ChatUser> {
  return Promise.resolve({
    id: person.id,
    name: person.name,
    avatarUrl: person.avatarUrl,
    initials: person.initials ?? initialsFromName(person.name),
  });
}

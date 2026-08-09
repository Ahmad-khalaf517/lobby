import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  DmConversationSchema,
  DmListResponseSchema,
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

const DM_PAGE_SIZE = 50;

/**
 * Direct messages use NestJS only to discover/create conversations. History,
 * message mutations, read state, and Realtime use the registered user's
 * RLS-scoped Supabase client.
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
  private conversationStates = new Map<string, DmConversationRow>();
  private readonly pendingByClientId = new Map<string, { userId: string; temporaryId: string }>();

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
  private readonly historyHasMoreSignal = signal<Record<string, boolean>>({});
  readonly historyLoadingRecord = this.historyLoadingSignal.asReadonly();
  readonly historyHasMoreRecord = this.historyHasMoreSignal.asReadonly();

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
      const apiRows = DmListResponseSchema.parse(response);
      const statesResult = apiRows.length
        ? await this.supabaseSession.client
            .from('dm_conversations')
            .select()
            .in(
              'id',
              apiRows.map((row) => row.conversationId),
            )
        : { data: [], error: null };
      if (statesResult.error) throw statesResult.error;
      this.assertCurrent(scope);
      this.conversationStates = new Map(
        (statesResult.data ?? []).map((row) => [row.id, row] as const),
      );
      const rows = await Promise.all(
        apiRows.map(async (apiRow) => {
          const state = this.conversationStates.get(apiRow.conversationId);
          const clearedAt = state ? clearedAtFor(state, scope.userId!) : null;
          const readAt = state ? readAtFor(state, scope.userId!) : null;
          const after = latestTimestamp(clearedAt, readAt);
          let countQuery = this.supabaseSession.client
            .from('dm_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', apiRow.conversationId)
            .neq('sender_id', scope.userId!);
          if (after) countQuery = countQuery.gt('created_at', after);
          const { count, error } = await countQuery;
          if (error) throw error;
          return toConversation(apiRow, count ?? 0);
        }),
      );
      this.assertCurrent(scope);
      this.conversationsSignal.set(
        rows
          .filter((row) => {
            const state = this.conversationStates.get(row.conversationId);
            const clearedAt = state ? clearedAtFor(state, scope.userId!) : null;
            return !clearedAt || row.lastMessageAt > clearedAt;
          })
          .map((row) => row),
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
    const history = (await this.fetchMessageRows(conversation.conversationId, scope.userId!)).map(
      dmMessageFromRow,
    );

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
    this.historyHasMoreSignal.update((record) => ({
      ...record,
      [userId]: history.length === DM_PAGE_SIZE,
    }));
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

  async loadOlder(userId: string): Promise<void> {
    if (this.historyLoadingSignal()[userId] || !this.historyHasMoreSignal()[userId]) return;
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    const oldest = this.messagesSignal()[userId]?.[0];
    if (!conversation || !oldest) return;

    this.setHistoryLoading(userId, true);
    try {
      const history = (
        await this.fetchMessageRows(conversation.conversationId, scope.userId!, oldest.createdAt)
      ).map(dmMessageFromRow);
      const [selfAuthor, partnerAuthor] = await Promise.all([
        this.selfAuthor(scope),
        authorFromPerson(conversation.partner),
      ]);
      this.assertCurrent(scope);
      const mapped = history.map((message) =>
        this.toChatMessage(
          message,
          message.senderId === this.currentUserId() ? selfAuthor : partnerAuthor,
          this.resolveReplyFromCache(userId, message.replyToMessageId),
        ),
      );
      this.messagesSignal.update((store) => {
        const current = store[userId] ?? [];
        const existing = new Set(current.map((message) => message.id));
        return {
          ...store,
          [userId]: [...mapped.filter((message) => !existing.has(message.id)), ...current],
        };
      });
      this.historyHasMoreSignal.update((record) => ({
        ...record,
        [userId]: history.length === DM_PAGE_SIZE,
      }));
    } finally {
      if (this.sessionScope.isCurrent(scope)) this.setHistoryLoading(userId, false);
    }
  }

  /** Send immediately in the UI, then reconcile the idempotent DM RPC result. */
  async send(userId: string, text: string, reply: ChatReplyPreview | null = null): Promise<void> {
    const scope = this.requireScope();
    const content = text.trim();
    if (!content) {
      return;
    }

    const conversation = await this.ensureConversation(userId);
    const clientMessageId = crypto.randomUUID();
    const temporaryId = `pending:${clientMessageId}`;
    const pending: ChatMessage = {
      id: temporaryId,
      author: await this.selfAuthor(scope),
      text: content,
      createdAt: new Date().toISOString(),
      reactions: [],
      ownReaction: null,
      reply,
      edited: false,
      deleted: false,
      pending: true,
      failed: false,
    };
    this.pendingByClientId.set(clientMessageId, { userId, temporaryId });
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: [...(store[userId] ?? []), pending],
    }));
    this.bumpConversation(userId, content, pending.createdAt);

    try {
      const { data, error } = await this.supabaseSession.client.rpc('create_dm_message', {
        p_conversation_id: conversation.conversationId,
        p_content: content,
        p_client_message_id: clientMessageId,
        ...(reply ? { p_reply_to: reply.messageId } : {}),
      });
      if (error) throw error;
      this.assertCurrent(scope);
      await this.reconcileMessage(userId, data, scope);
      this.markRead(userId);
    } catch (error) {
      if (this.sessionScope.isCurrent(scope)) {
        this.messagesSignal.update((store) => ({
          ...store,
          [userId]: (store[userId] ?? []).map((message) =>
            message.id === temporaryId ? { ...message, pending: false, failed: true } : message,
          ),
        }));
      }
      throw error;
    }
  }

  /** Apply an edit optimistically, rolling back if the owner-only RPC fails. */
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
      const { data, error } = await this.supabaseSession.client.rpc('edit_dm_message', {
        p_conversation_id: conversation.conversationId,
        p_message_id: messageId,
        p_content: content,
      });
      if (error) throw error;
      this.assertCurrent(scope);
      this.handleMessageUpdated(data);
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

  /** Remove an owned message through the participant-scoped RPC. */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    if (!conversation) return;
    const previous = this.messagesSignal()[userId] ?? [];
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: (store[userId] ?? []).filter((message) => message.id !== messageId),
    }));
    try {
      const { error } = await this.supabaseSession.client.rpc('delete_dm_message', {
        p_conversation_id: conversation.conversationId,
        p_message_id: messageId,
      });
      if (error) throw error;
      this.assertCurrent(scope);
      await this.loadConversations();
    } catch (error) {
      if (this.sessionScope.isCurrent(scope)) {
        this.messagesSignal.update((store) => ({ ...store, [userId]: previous }));
      }
      throw error;
    }
  }

  /** Toggle the current user's reaction through the participant-scoped RPC. */
  async toggleReaction(userId: string, messageId: string, emoji: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    const current = (this.messagesSignal()[userId] ?? []).find(
      (message) => message.id === messageId,
    );
    if (!conversation || !current) {
      return;
    }

    try {
      const { data, error } = await this.supabaseSession.client.rpc('toggle_dm_message_reaction', {
        p_conversation_id: conversation.conversationId,
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (error) throw error;
      this.assertCurrent(scope);
      this.handleMessageUpdated(data);
    } catch {
      return; // Keep the previous state on failure.
    }
  }

  /** Clear unread state locally and persist the participant read boundary. */
  markRead(userId: string): void {
    this.conversationsSignal.update((list) =>
      list.map((conversation) =>
        conversation.friendId === userId ? { ...conversation, unread: 0 } : conversation,
      ),
    );
    const conversation = this.conversationFor(userId);
    if (conversation) {
      void this.supabaseSession.client
        .rpc('mark_dm_conversation_read', { p_conversation_id: conversation.conversationId })
        .then(({ error }) => {
          if (error) console.error('[DirectMessagesService] Could not persist read state.', error);
        });
    }
  }

  /**
   * Hide the conversation history for this participant only. The other
   * participant's history is never deleted.
   */
  async clearChatHistory(userId: string): Promise<void> {
    const scope = this.requireScope();
    const conversation = this.conversationFor(userId);
    if (!conversation) return;
    const { error } = await this.supabaseSession.client.rpc('clear_dm_conversation', {
      p_conversation_id: conversation.conversationId,
    });
    if (error) throw error;
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
    const { data: state, error } = await this.supabaseSession.client
      .from('dm_conversations')
      .select()
      .eq('id', apiConversation.conversationId)
      .single();
    if (error) throw error;
    this.assertCurrent(scope);
    this.conversationStates.set(state.id, state);
    const conversation = toConversation(apiConversation, 0);
    this.upsertConversation(conversation);
    return conversation;
  }

  private async fetchMessageRows(
    conversationId: string,
    currentUserId: string,
    before?: string,
  ): Promise<DmMessageRow[]> {
    const state = this.conversationStates.get(conversationId);
    let query = this.supabaseSession.client
      .from('dm_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(DM_PAGE_SIZE);
    const clearedAt = state ? clearedAtFor(state, currentUserId) : null;
    if (clearedAt) query = query.gt('created_at', clearedAt);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) throw error;
    return [...(data ?? [])].reverse();
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
        ? [
            {
              emoji: message.reactionEmoji,
              count: 1,
              reactedByMe: message.reactionUserId === this.currentUserId(),
            },
          ]
        : [],
      ownReaction: message.reactionUserId === this.currentUserId() ? message.reactionEmoji : null,
      reply,
      edited: message.editedAt !== null,
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
        { event: 'UPDATE', schema: 'public', table: 'dm_messages' },
        (payload) => this.ngZone.run(() => this.handleMessageUpdated(payload.new as DmMessageRow)),
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dm_conversations' },
        (payload) =>
          this.ngZone.run(() => this.handleConversationUpdated(payload.new as DmConversationRow)),
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
    this.historyHasMoreSignal.set({});
    this.conversationStates.clear();
    this.pendingByClientId.clear();
    this.activeConversationSignal.set(null);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
    this.myProfile = null;
    this.myProfilePromise = null;
    this.toast.dismissNotifications();
  }

  private async handleIncomingMessage(row: DmMessageRow): Promise<void> {
    const scope = this.requireScope();

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
    const author =
      row.sender_id === scope.userId
        ? await this.selfAuthor(scope)
        : await authorFromPerson(conversation.partner);
    const reply = this.resolveReplyFromCache(userId, dmMessage.replyToMessageId);
    const message = this.toChatMessage(dmMessage, author, reply);
    this.assertCurrent(scope);

    this.upsertChatMessage(userId, message, row.client_message_id);
    this.bumpConversation(userId, dmMessage.body, dmMessage.createdAt);

    if (row.sender_id === scope.userId) return;

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

  private handleMessageUpdated(row: DmMessageRow): void {
    const currentUserId = this.currentUserId();
    this.messagesSignal.update((store) =>
      Object.fromEntries(
        Object.entries(store).map(([userId, messages]) => [
          userId,
          messages.map((message) =>
            message.id === row.id
              ? {
                  ...message,
                  text: row.content,
                  edited: row.edited_at !== null,
                  ownReaction: row.reaction_user_id === currentUserId ? row.reaction_emoji : null,
                  reactions: row.reaction_emoji
                    ? [
                        {
                          emoji: row.reaction_emoji,
                          count: 1,
                          reactedByMe: row.reaction_user_id === currentUserId,
                        },
                      ]
                    : [],
                }
              : message,
          ),
        ]),
      ),
    );
    void this.loadConversations().catch(() => undefined);
  }

  private async reconcileMessage(
    userId: string,
    row: DmMessageRow,
    scope: SessionScope,
  ): Promise<void> {
    const conversation = this.conversationFor(userId);
    if (!conversation) return;
    const author =
      row.sender_id === scope.userId
        ? await this.selfAuthor(scope)
        : await authorFromPerson(conversation.partner);
    this.assertCurrent(scope);
    this.upsertChatMessage(
      userId,
      this.toChatMessage(
        dmMessageFromRow(row),
        author,
        this.resolveReplyFromCache(userId, row.reply_to),
      ),
      row.client_message_id,
    );
    this.bumpConversation(userId, row.content, row.created_at);
  }

  private upsertChatMessage(
    userId: string,
    message: ChatMessage,
    clientMessageId: string | null,
  ): void {
    const pending = clientMessageId ? this.pendingByClientId.get(clientMessageId) : undefined;
    this.messagesSignal.update((store) => {
      const current = store[userId] ?? [];
      const withoutDuplicate = current.filter(
        (candidate) => candidate.id !== message.id && candidate.id !== pending?.temporaryId,
      );
      return {
        ...store,
        [userId]: [...withoutDuplicate, message].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      };
    });
    if (clientMessageId) this.pendingByClientId.delete(clientMessageId);
  }

  private async handleNewConversation(row: DmConversationRow): Promise<void> {
    const scope = this.requireScope();
    const currentUserId = scope.userId;
    if (row.user_a_id !== currentUserId && row.user_b_id !== currentUserId) return;
    if (this.conversationsSignal().some((c) => c.conversationId === row.id)) return;
    await this.loadConversations();
    this.assertCurrent(scope);
  }

  private handleConversationUpdated(row: DmConversationRow): void {
    const userId = this.currentUserId();
    if (!userId || (row.user_a_id !== userId && row.user_b_id !== userId)) return;
    this.conversationStates.set(row.id, row);
    const conversation = this.conversationsSignal().find(
      (candidate) => candidate.conversationId === row.id,
    );
    const clearedAt = clearedAtFor(row, userId);
    if (conversation && clearedAt) {
      this.messagesSignal.update((store) => ({
        ...store,
        [conversation.friendId]: (store[conversation.friendId] ?? []).filter(
          (message) => message.createdAt > clearedAt,
        ),
      }));
    }
    void this.loadConversations().catch(() => undefined);
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

function toConversation(api: DmConversation, unread = 0): Conversation {
  return {
    friendId: api.user.userId,
    conversationId: api.conversationId,
    unread,
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
    clientMessageId: row.client_message_id,
    reactionEmoji: row.reaction_emoji,
    reactionUserId: row.reaction_user_id,
    replyToMessageId: row.reply_to,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

function clearedAtFor(row: DmConversationRow, userId: string): string | null {
  return row.user_a_id === userId ? row.user_a_cleared_at : row.user_b_cleared_at;
}

function readAtFor(row: DmConversationRow, userId: string): string | null {
  return row.user_a_id === userId ? row.user_a_last_read_at : row.user_b_last_read_at;
}

function latestTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function authorFromPerson(person: Person): Promise<ChatUser> {
  return Promise.resolve({
    id: person.id,
    name: person.name,
    avatarUrl: person.avatarUrl,
    initials: person.initials ?? initialsFromName(person.name),
  });
}

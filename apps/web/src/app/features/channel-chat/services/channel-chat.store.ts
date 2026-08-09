import { computed, inject, Injectable, signal } from '@angular/core';
import type { PostgrestError, RealtimeChannel } from '@supabase/supabase-js';
import { MAX_MESSAGE_LENGTH } from '@lobby/shared';

import { SessionScopeService, type SessionScope } from '../../../core/session-scope.service';
import type { Database } from '../../../core/supabase/database.types';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';
import type {
  ChatMessage,
  ChatReaction,
  SendChatMessage,
} from '../../../shared/components/room-chat';
import { AuthService } from '../../auth/services/auth';

type PublicMessageRow = Database['public']['Tables']['messages']['Row'];
type PublicReactionRow = Database['public']['Tables']['message_reactions']['Row'];
type ChannelMemberRow =
  Database['public']['Functions']['join_authenticated_channel_chat']['Returns'];
type ChatMember =
  Database['public']['Functions']['list_authenticated_channel_chat_members']['Returns'][number];

type PageCursor = { createdAt: string; id: string };

type PendingMessage = {
  clientMessageId: string;
  content: string;
  replyToMessageId: string | null;
  message: ChatMessage;
};

type MessagePage = {
  messages: PublicMessageRow[];
  nextCursor: PageCursor | null;
};

type ActiveOperation = { scope: SessionScope; revision: number; channelId: string };

const PAGE_SIZE = 50;
const DELETED_MESSAGE_CONTENT = 'This message was deleted.';

@Injectable({ providedIn: 'root' })
export class ChannelChatStore {
  private readonly auth = inject(AuthService);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly supabase = inject(SupabaseSessionService);

  private readonly _channelId = signal<string | null>(null);
  private readonly _currentMember = signal<ChannelMemberRow | null>(null);
  private readonly _members = signal<ChatMember[]>([]);
  private readonly _messages = signal<PublicMessageRow[]>([]);
  private readonly _replyTargets = signal<PublicMessageRow[]>([]);
  private readonly _reactions = signal<PublicReactionRow[]>([]);
  private readonly _pending = signal<PendingMessage[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadingOlder = signal(false);
  private readonly _initialized = signal(false);
  private readonly _connected = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _nextCursor = signal<PageCursor | null>(null);

  private realtimeChannel: RealtimeChannel | null = null;
  private activeRevision = 0;

  readonly channelId = this._channelId.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadingOlder = this._loadingOlder.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasMore = computed(() => this._nextCursor() !== null);
  readonly hasFailedSends = computed(() => this._pending().some(({ message }) => message.failed));
  readonly disabled = computed(() => !this._initialized() || this._loading());
  readonly memberNames = computed(() => [
    ...new Set(this._members().map((member) => member.display_name)),
  ]);
  readonly chatMessages = computed<ChatMessage[]>(() => {
    const persisted = this._messages().map((message) => this.toChatMessage(message));
    return [...persisted, ...this._pending().map(({ message }) => message)].sort(compareMessages);
  });

  constructor() {
    this.sessionScope.registerCleanup(() => this.close());
  }

  async open(channelId: string, force = false): Promise<void> {
    const scope = this.requireScope();
    if (!force && this._channelId() === channelId && (this._initialized() || this._loading())) {
      return;
    }

    const revision = ++this.activeRevision;
    this._channelId.set(channelId);
    this._currentMember.set(null);
    this._members.set([]);
    this._messages.set([]);
    this._replyTargets.set([]);
    this._reactions.set([]);
    this._pending.set([]);
    this._nextCursor.set(null);
    this._initialized.set(false);
    this._connected.set(false);
    this._loading.set(true);
    this._error.set(null);

    try {
      await this.removeRealtimeChannel();
      this.assertCurrent(scope, revision, channelId);

      const member = await this.request(() =>
        this.supabase.client.rpc('join_authenticated_channel_chat', {
          p_channel_id: channelId,
        }),
      );
      this.assertCurrent(scope, revision, channelId);
      this._currentMember.set(member);

      // Subscribe before taking the initial snapshot. Snapshot rows are merged
      // with any early events so there is no load/subscription race window.
      this.subscribe(channelId, scope, revision);

      const [page, members] = await Promise.all([
        this.fetchPage(channelId, null),
        this.fetchMembers(channelId),
      ]);
      this.assertCurrent(scope, revision, channelId);
      this._messages.update((messages) => mergeMessages(messages, page.messages));
      this._members.set(members);
      this._nextCursor.set(page.nextCursor);

      const operation = { scope, revision, channelId };
      await Promise.all([
        this.loadReactionsFor(page.messages, operation),
        this.loadMissingReplyTargets(page.messages, operation),
      ]);
      this.assertActive(operation);
      this._initialized.set(true);
    } catch (error: unknown) {
      if (this.isCurrent(scope, revision, channelId)) this._error.set(describeError(error));
      throw error;
    } finally {
      if (this.isCurrent(scope, revision, channelId)) this._loading.set(false);
    }
  }

  async retry(): Promise<void> {
    const channelId = this._channelId();
    if (!channelId) return;
    await this.open(channelId, true);
  }

  async loadOlder(): Promise<void> {
    const operation = this.captureActive();
    const cursor = this._nextCursor();
    if (!cursor || this._loadingOlder()) return;

    this._loadingOlder.set(true);
    this._error.set(null);
    try {
      const page = await this.fetchPage(operation.channelId, cursor);
      this.assertActive(operation);
      this._messages.update((messages) => mergeMessages(messages, page.messages));
      this._nextCursor.set(page.nextCursor);
      await Promise.all([
        this.loadReactionsFor(page.messages, operation),
        this.loadMissingReplyTargets(page.messages, operation),
      ]);
    } catch (error: unknown) {
      if (this.isActive(operation)) this._error.set(describeError(error));
      throw error;
    } finally {
      if (this.isActive(operation)) this._loadingOlder.set(false);
    }
  }

  async send(input: SendChatMessage): Promise<void> {
    const operation = this.captureActive();
    const content = normalizeContent(input.text);
    const clientMessageId = crypto.randomUUID();
    const pending = this.createPending(clientMessageId, content, input.replyTo);
    this._pending.update((messages) => [...messages, pending]);
    await this.persistPending(operation, pending);
  }

  async retryFailedSends(): Promise<void> {
    const operation = this.captureActive();
    const failed = this._pending().filter(({ message }) => message.failed);
    await Promise.allSettled(failed.map((pending) => this.persistPending(operation, pending)));
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const operation = this.captureActive();
    const normalized = normalizeContent(content);
    const editedAt = new Date().toISOString();
    this._messages.update((messages) =>
      messages.map((message) =>
        message.id === messageId
          ? { ...message, content: normalized, edited_at: editedAt }
          : message,
      ),
    );

    try {
      const message = await this.request<PublicMessageRow>(() =>
        this.supabase.client.rpc('edit_authenticated_channel_message', {
          p_channel_id: operation.channelId,
          p_message_id: messageId,
          p_content: normalized,
        }),
      );
      this.assertActive(operation);
      this.upsertMessage(message);
      this._error.set(null);
    } catch (error: unknown) {
      if (this.isActive(operation)) await this.refreshMessage(messageId, operation);
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    const operation = this.captureActive();
    const deletedAt = new Date().toISOString();
    this._messages.update((messages) =>
      messages.map((message) =>
        message.id === messageId
          ? { ...message, content: DELETED_MESSAGE_CONTENT, deleted_at: deletedAt }
          : message,
      ),
    );
    this._reactions.update((reactions) =>
      reactions.filter((reaction) => reaction.message_id !== messageId),
    );

    try {
      const message = await this.request(() =>
        this.supabase.client.rpc('delete_authenticated_channel_message', {
          p_channel_id: operation.channelId,
          p_message_id: messageId,
        }),
      );
      this.assertActive(operation);
      this.upsertMessage(message);
      this._error.set(null);
    } catch (error: unknown) {
      if (this.isActive(operation)) {
        await Promise.allSettled([
          this.refreshMessage(messageId, operation),
          this.refreshReactions(messageId, operation),
        ]);
      }
      throw error;
    }
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const operation = this.captureActive();
    const member = this.requireMember();
    const normalizedEmoji = normalizeEmoji(emoji);
    const previousOwn = this._reactions().find(
      (reaction) => reaction.message_id === messageId && reaction.channel_member_id === member.id,
    );
    this.optimisticallyToggleReaction(messageId, normalizedEmoji, member.id, operation.channelId);

    try {
      await this.request(() =>
        this.supabase.client.rpc('toggle_authenticated_channel_message_reaction', {
          p_channel_id: operation.channelId,
          p_message_id: messageId,
          p_emoji: normalizedEmoji,
        }),
      );
      this.assertActive(operation);
      await this.refreshReactions(messageId, operation);
      this._error.set(null);
    } catch (error: unknown) {
      if (this.isActive(operation)) {
        try {
          await this.refreshReactions(messageId, operation);
        } catch {
          this.restoreOwnReaction(messageId, member.id, previousOwn ?? null);
        }
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    this.activeRevision += 1;
    this._channelId.set(null);
    this._currentMember.set(null);
    this._members.set([]);
    this._messages.set([]);
    this._replyTargets.set([]);
    this._reactions.set([]);
    this._pending.set([]);
    this._loading.set(false);
    this._loadingOlder.set(false);
    this._initialized.set(false);
    this._connected.set(false);
    this._error.set(null);
    this._nextCursor.set(null);
    await this.removeRealtimeChannel();
  }

  private async persistPending(operation: ActiveOperation, pending: PendingMessage): Promise<void> {
    this._pending.update((messages) =>
      messages.map((entry) =>
        entry.clientMessageId === pending.clientMessageId
          ? { ...entry, message: { ...entry.message, pending: true, failed: false } }
          : entry,
      ),
    );

    try {
      const message = await this.request(() =>
        this.supabase.client.rpc('create_authenticated_channel_message', {
          p_channel_id: operation.channelId,
          p_content: pending.content,
          p_client_message_id: pending.clientMessageId,
          ...(pending.replyToMessageId ? { p_reply_to: pending.replyToMessageId } : {}),
        }),
      );
      this.assertActive(operation);
      this.upsertMessage(message);
      await this.loadMissingReplyTargets([message], operation);
      this._error.set(null);
    } catch (error: unknown) {
      if (this.isActive(operation)) {
        this._pending.update((messages) =>
          messages.map((entry) =>
            entry.clientMessageId === pending.clientMessageId
              ? { ...entry, message: { ...entry.message, pending: false, failed: true } }
              : entry,
          ),
        );
        this._error.set(describeError(error));
      }
      throw error;
    }
  }

  private createPending(
    clientMessageId: string,
    content: string,
    replyToMessageId: string | null,
  ): PendingMessage {
    const member = this.requireMember();
    const author = this.memberById(member.id);

    return {
      clientMessageId,
      content,
      replyToMessageId,
      message: {
        id: `pending:${clientMessageId}`,
        author: {
          id: member.user_id,
          name: author?.display_name ?? 'You',
          avatarUrl: author?.avatar_url || undefined,
        },
        text: content,
        createdAt: new Date().toISOString(),
        reactions: [],
        ownReaction: null,
        reply: this.replyPreview(replyToMessageId),
        edited: false,
        deleted: false,
        pending: true,
        failed: false,
      },
    };
  }

  private toChatMessage(message: PublicMessageRow): ChatMessage {
    const author = this.memberById(message.sender_id);
    const reactions = message.deleted_at
      ? []
      : aggregateReactions(
          this._reactions().filter((reaction) => reaction.message_id === message.id),
          this._currentMember()?.id ?? null,
        );

    return {
      id: message.id,
      author: {
        id: author?.user_id ?? message.sender_id,
        name: author?.display_name ?? 'Unknown member',
        avatarUrl: author?.avatar_url || undefined,
      },
      text: message.deleted_at ? DELETED_MESSAGE_CONTENT : message.content,
      createdAt: message.created_at,
      reactions,
      ownReaction: reactions.find((reaction) => reaction.reactedByMe)?.emoji ?? null,
      reply: this.replyPreview(message.reply_to),
      edited: message.edited_at !== null,
      deleted: message.deleted_at !== null,
      pending: false,
      failed: false,
    };
  }

  private replyPreview(messageId: string | null): ChatMessage['reply'] {
    if (!messageId) return null;
    const target = [...this._messages(), ...this._replyTargets()].find(
      (message) => message.id === messageId,
    );
    if (!target) return null;
    const author = this.memberById(target.sender_id);
    return {
      messageId,
      authorName: author?.display_name ?? 'Unknown member',
      text: target.deleted_at ? 'Deleted message' : target.content,
    };
  }

  private memberById(memberId: string): ChatMember | undefined {
    return this._members().find((member) => member.channel_member_id === memberId);
  }

  private optimisticallyToggleReaction(
    messageId: string,
    emoji: string,
    memberId: string,
    channelId: string,
  ): void {
    const existing = this._reactions().find(
      (reaction) => reaction.message_id === messageId && reaction.channel_member_id === memberId,
    );
    const remaining = this._reactions().filter(
      (reaction) => !(reaction.message_id === messageId && reaction.channel_member_id === memberId),
    );
    if (existing?.emoji === emoji) {
      this._reactions.set(remaining);
      return;
    }

    const now = new Date().toISOString();
    this._reactions.set([
      ...remaining,
      {
        id: `optimistic:${crypto.randomUUID()}`,
        channel_id: channelId,
        message_id: messageId,
        channel_member_id: memberId,
        emoji,
        created_at: now,
        updated_at: now,
      },
    ]);
  }

  private restoreOwnReaction(
    messageId: string,
    memberId: string,
    reaction: PublicReactionRow | null,
  ): void {
    this._reactions.update((reactions) => [
      ...reactions.filter(
        (candidate) =>
          !(candidate.message_id === messageId && candidate.channel_member_id === memberId),
      ),
      ...(reaction ? [reaction] : []),
    ]);
  }

  private subscribe(channelId: string, scope: SessionScope, revision: number): void {
    const channel = this.supabase.client
      .channel(`auth-channel:${channelId}:${revision}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const operation = { scope, revision, channelId };
          if (!this.isActive(operation)) return;
          if (payload.eventType === 'DELETE') {
            const id = readId(payload.old);
            if (id) this.removeMessage(id);
            return;
          }
          if (!isMessageRow(payload.new)) return;
          this.upsertMessage(payload.new);
          if (!this.memberById(payload.new.sender_id)) void this.refreshMembers(operation);
          void this.loadMissingReplyTargets([payload.new], operation);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const operation = { scope, revision, channelId };
          if (!this.isActive(operation)) return;
          if (payload.eventType === 'DELETE') {
            const id = readId(payload.old);
            if (id) this.removeReaction(id);
            return;
          }
          if (!isReactionRow(payload.new)) return;
          this.upsertReaction(payload.new);
          if (!this.memberById(payload.new.channel_member_id)) void this.refreshMembers(operation);
        },
      )
      .subscribe((status, error) => {
        if (!this.isCurrent(scope, revision, channelId)) return;
        this._connected.set(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this._error.set(error?.message ?? 'Realtime connection failed.');
        }
      });

    this.realtimeChannel = channel;
  }

  private async fetchPage(channelId: string, cursor: PageCursor | null): Promise<MessagePage> {
    let query = this.supabase.client
      .from('messages')
      .select()
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const rows = await this.request(() => query);
    const hasMore = rows.length > PAGE_SIZE;
    const pageRows = rows.slice(0, PAGE_SIZE);
    const oldest = pageRows.at(-1);
    return {
      messages: sortMessageRows(pageRows),
      nextCursor: hasMore && oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
    };
  }

  private fetchMembers(channelId: string): Promise<ChatMember[]> {
    return this.request(() =>
      this.supabase.client.rpc('list_authenticated_channel_chat_members', {
        p_channel_id: channelId,
      }),
    );
  }

  private async loadReactionsFor(
    messages: PublicMessageRow[],
    operation: ActiveOperation,
  ): Promise<void> {
    const messageIds = messages.filter((message) => !message.deleted_at).map(({ id }) => id);
    if (messageIds.length === 0) return;
    const reactions = await this.request(() =>
      this.supabase.client
        .from('message_reactions')
        .select()
        .eq('channel_id', operation.channelId)
        .in('message_id', messageIds),
    );
    this.assertActive(operation);
    this._reactions.update((current) => mergeReactions(current, reactions));
  }

  private async loadMissingReplyTargets(
    messages: PublicMessageRow[],
    operation: ActiveOperation,
  ): Promise<void> {
    const known = new Set([
      ...this._messages().map(({ id }) => id),
      ...this._replyTargets().map(({ id }) => id),
    ]);
    const missing = [
      ...new Set(
        messages
          .map(({ reply_to: replyTo }) => replyTo)
          .filter((id): id is string => id !== null && !known.has(id)),
      ),
    ];
    if (missing.length === 0) return;

    const targets = await this.request(() =>
      this.supabase.client
        .from('messages')
        .select()
        .eq('channel_id', operation.channelId)
        .in('id', missing),
    );
    this.assertActive(operation);
    this._replyTargets.update((current) => mergeMessages(current, targets));
  }

  private async refreshMessage(messageId: string, operation: ActiveOperation): Promise<void> {
    try {
      const message = await this.request<PublicMessageRow>(() =>
        this.supabase.client
          .from('messages')
          .select()
          .eq('channel_id', operation.channelId)
          .eq('id', messageId)
          .single(),
      );
      this.assertActive(operation);
      this.upsertMessage(message);
    } catch {
      // A concurrent channel/message removal must not revive stale state.
    }
  }

  private async refreshReactions(messageId: string, operation: ActiveOperation): Promise<void> {
    const reactions = await this.request(() =>
      this.supabase.client
        .from('message_reactions')
        .select()
        .eq('channel_id', operation.channelId)
        .eq('message_id', messageId),
    );
    this.assertActive(operation);
    this._reactions.update((current) => [
      ...current.filter((reaction) => reaction.message_id !== messageId),
      ...reactions,
    ]);
  }

  private async refreshMembers(operation: ActiveOperation): Promise<void> {
    try {
      const members = await this.fetchMembers(operation.channelId);
      this.assertActive(operation);
      this._members.set(members);
    } catch {
      // Membership revocation is enforced by RLS/RPC and will surface on the
      // next user operation; stale channel work is never committed here.
    }
  }

  private upsertMessage(message: PublicMessageRow): void {
    this._messages.update((messages) => mergeMessages(messages, [message]));
    if (message.client_message_id) {
      this._pending.update((pending) =>
        pending.filter((entry) => entry.clientMessageId !== message.client_message_id),
      );
    }
  }

  private removeMessage(messageId: string): void {
    this._messages.update((messages) => messages.filter((message) => message.id !== messageId));
    this._replyTargets.update((messages) => messages.filter((message) => message.id !== messageId));
    this._reactions.update((reactions) =>
      reactions.filter((reaction) => reaction.message_id !== messageId),
    );
  }

  private upsertReaction(reaction: PublicReactionRow): void {
    this._reactions.update((reactions) => [
      ...reactions.filter(
        (candidate) =>
          candidate.id !== reaction.id &&
          !(
            candidate.message_id === reaction.message_id &&
            candidate.channel_member_id === reaction.channel_member_id
          ),
      ),
      reaction,
    ]);
  }

  private removeReaction(reactionId: string): void {
    this._reactions.update((reactions) =>
      reactions.filter((reaction) => reaction.id !== reactionId),
    );
  }

  private captureActive(): ActiveOperation {
    const scope = this.requireScope();
    const channelId = this._channelId();
    if (!channelId || !this._initialized()) throw new Error('Channel chat is not ready.');
    return { scope, channelId, revision: this.activeRevision };
  }

  private requireScope(): SessionScope {
    const scope = this.sessionScope.capture();
    if (!scope.userId) throw new Error('An authenticated account is required.');
    return scope;
  }

  private requireMember(): ChannelMemberRow {
    const member = this._currentMember();
    if (!member || member.left_at || member.removed_at) {
      throw new Error('Active channel membership is required.');
    }
    return member;
  }

  private assertActive(operation: ActiveOperation): void {
    if (!this.isActive(operation)) throw new Error('The active channel or account changed.');
  }

  private isActive(operation: ActiveOperation): boolean {
    return this.isCurrent(operation.scope, operation.revision, operation.channelId);
  }

  private assertCurrent(scope: SessionScope, revision: number, channelId: string): void {
    if (!this.isCurrent(scope, revision, channelId)) {
      throw new Error('The active channel or account changed.');
    }
  }

  private isCurrent(scope: SessionScope, revision: number, channelId: string): boolean {
    return (
      this.sessionScope.isCurrent(scope) &&
      revision === this.activeRevision &&
      this._channelId() === channelId
    );
  }

  private async request<T>(
    operation: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  ): Promise<T> {
    let result = await operation();
    if (result.error && isAuthError(result.error)) {
      await this.auth.refreshSession();
      result = await operation();
    }
    if (result.error) throw result.error;
    if (result.data === null) throw new Error('Supabase returned no data.');
    return result.data;
  }

  private async removeRealtimeChannel(): Promise<void> {
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    if (channel) await this.supabase.client.removeChannel(channel).catch(() => undefined);
  }
}

function normalizeContent(content: string): string {
  const normalized = content.trim();
  if (!normalized || normalized.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must contain between 1 and ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeEmoji(emoji: string): string {
  if (!emoji || emoji.length > 16) {
    throw new Error('Reaction emoji must contain between 1 and 16 characters.');
  }
  return emoji;
}

function mergeMessages(
  current: PublicMessageRow[],
  incoming: PublicMessageRow[],
): PublicMessageRow[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (message.client_message_id) {
      for (const [id, candidate] of byId) {
        if (candidate.client_message_id === message.client_message_id && id !== message.id) {
          byId.delete(id);
        }
      }
    }
    byId.set(message.id, message);
  }
  return sortMessageRows([...byId.values()]);
}

function sortMessageRows(messages: PublicMessageRow[]): PublicMessageRow[] {
  return [...messages].sort(
    (left, right) =>
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  );
}

function mergeReactions(
  current: PublicReactionRow[],
  incoming: PublicReactionRow[],
): PublicReactionRow[] {
  const byActor = new Map(
    current.map((reaction) => [reactionActorKey(reaction), reaction] as const),
  );
  for (const reaction of incoming) byActor.set(reactionActorKey(reaction), reaction);
  return [...byActor.values()];
}

function reactionActorKey(reaction: PublicReactionRow): string {
  return `${reaction.message_id}:${reaction.channel_member_id}`;
}

function aggregateReactions(
  reactions: PublicReactionRow[],
  currentMemberId: string | null,
): ChatReaction[] {
  const grouped = new Map<string, ChatReaction>();
  for (const reaction of mergeReactions([], reactions)) {
    const current = grouped.get(reaction.emoji);
    grouped.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: (current?.count ?? 0) + 1,
      reactedByMe: current?.reactedByMe === true || reaction.channel_member_id === currentMemberId,
    });
  }
  return [...grouped.values()].sort(
    (left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji),
  );
}

function compareMessages(left: ChatMessage, right: ChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readId(value: unknown): string | null {
  return isRecord(value) && typeof value['id'] === 'string' ? value['id'] : null;
}

function isMessageRow(value: unknown): value is PublicMessageRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['channel_id'] === 'string' &&
    typeof value['sender_id'] === 'string' &&
    typeof value['content'] === 'string' &&
    typeof value['created_at'] === 'string'
  );
}

function isReactionRow(value: unknown): value is PublicReactionRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['channel_id'] === 'string' &&
    typeof value['message_id'] === 'string' &&
    typeof value['channel_member_id'] === 'string' &&
    typeof value['emoji'] === 'string' &&
    typeof value['created_at'] === 'string' &&
    typeof value['updated_at'] === 'string'
  );
}

function isAuthError(error: PostgrestError): boolean {
  return error.code === 'PGRST301' || /jwt|token|auth/i.test(error.message);
}

function describeError(error: unknown): string {
  if (isRecord(error) && error['code'] === '42501') {
    return 'You do not have access to this channel.';
  }
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return error instanceof Error ? error.message : 'Channel chat request failed. Please try again.';
}

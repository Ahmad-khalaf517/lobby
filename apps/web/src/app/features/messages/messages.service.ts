import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
import type { Person } from '../../shared/components/person-avatar/person.model';
import { personFromProfile } from '../../shared/components/person-avatar/person.util';
import type { ChatMessage, ChatReplyPreview, ChatUser } from '../../shared/components/room-chat';
import { initialsFromName } from '../../shared/components/room-chat';
import type { Conversation } from './messages.models';

/**
 * Direct messages feature state — backed by the DMs REST API.
 *
 * Conversations + message history load over REST (get-or-create per partner),
 * sending persists via POST, and reactions persist via the PUT/DELETE reaction
 * endpoints. Edit / delete / read-state have no DM endpoint yet, so those stay
 * optimistic/local until the backend ships them.
 */
@Injectable({ providedIn: 'root' })
export class DirectMessagesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly conversationsSignal = signal<Conversation[]>([]);
  private readonly messagesSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

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

  /** Fetch the sidebar conversation list. */
  async loadConversations(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const response = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/dms`));
      this.conversationsSignal.set(DmListResponseSchema.parse(response).map(toConversation));
    } catch {
      this.errorSignal.set('Could not load conversations.');
    } finally {
      this.loadingSignal.set(false);
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
    const conversation = await this.ensureConversation(userId);
    const cached = this.messagesSignal()[userId];

    if (cached && cached.length > 0 && this.historyLoaded.has(userId)) {
      this.setHistoryLoading(userId, false);
      void this.fetchHistory(userId, conversation).catch(() => undefined);
      return;
    }

    this.setHistoryLoading(userId, true);
    try {
      await this.fetchHistory(userId, conversation);
    } finally {
      this.setHistoryLoading(userId, false);
    }
  }

  /** Fetch + store a conversation's history, marking it as cached afterward. */
  private async fetchHistory(userId: string, conversation: Conversation): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/dms/${conversation.conversationId}/messages`),
    );
    const history = DmMessageHistorySchema.parse(response);

    const [selfAuthor, partnerAuthor] = await Promise.all([
      this.selfAuthor(),
      authorFromPerson(conversation.partner),
    ]);
    const mapped = history.map((message) =>
      this.toChatMessage(
        message,
        message.senderId === this.currentUserId() ? selfAuthor : partnerAuthor,
      ),
    );

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
    const content = text.trim();
    if (!content) {
      return;
    }

    const conversation = await this.ensureConversation(userId);
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/dms/${conversation.conversationId}/messages`, {
        body: content,
      }),
    );
    const created = DmMessageSchema.parse(response);

    const author =
      created.senderId === this.currentUserId()
        ? await this.selfAuthor()
        : await authorFromPerson(conversation.partner);

    const message: ChatMessage = {
      id: created.id,
      author,
      text: created.body,
      createdAt: created.createdAt,
      reactions: [],
      ownReaction: null,
      reply,
      edited: false,
      deleted: false,
      pending: false,
      failed: false,
    };

    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: [...(store[userId] ?? []), message],
    }));
    this.bumpConversation(conversation.friendId, created.body, created.createdAt);
    this.markRead(userId);
  }

  /** Update a message's text and flag it as edited — local-only until the API ships. */
  editMessage(userId: string, messageId: string, newText: string): void {
    const content = newText.trim();
    if (!content) {
      return;
    }
    this.messagesSignal.update((store) => ({
      ...store,
      [userId]: (store[userId] ?? []).map((message) =>
        message.id === messageId && message.text !== content
          ? { ...message, text: content, edited: true }
          : message,
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
    this.messagesSignal.update((store) => ({ ...store, [userId]: [] }));
    this.conversationsSignal.update((list) =>
      list.map((entry) => (entry.friendId === userId ? { ...entry, preview: null } : entry)),
    );
  }

  private async ensureConversation(userId: string): Promise<Conversation> {
    const existing = this.conversationFor(userId);
    if (existing) {
      return existing;
    }

    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/dms`, { userId }),
    );
    const apiConversation = DmConversationSchema.parse(response);
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

  private async selfAuthor(): Promise<ChatUser> {
    const profile = await this.ensureMyProfile();
    return {
      id: this.currentUserId(),
      name: profile.displayName,
      initials: initialsFromName(profile.displayName),
    };
  }

  private toChatMessage(message: DmMessage, author: ChatUser): ChatMessage {
    return {
      id: message.id,
      author,
      text: message.body,
      createdAt: message.createdAt,
      reactions: message.reactionEmoji
        ? [{ emoji: message.reactionEmoji, count: 1, reactedByMe: false }]
        : [],
      ownReaction: null,
      reply: null,
      edited: false,
      deleted: false,
      pending: false,
      failed: false,
    };
  }

  private async ensureMyProfile(): Promise<UserProfile> {
    if (this.myProfile) {
      return this.myProfile;
    }
    this.myProfilePromise ??= (async () => {
      const response = await firstValueFrom(
        this.http.get<unknown>(`${this.apiUrl}/users/${this.currentUserId()}/profile`),
      );
      return UserProfileSchema.parse(response);
    })();
    try {
      this.myProfile = await this.myProfilePromise;
      return this.myProfile;
    } catch (error) {
      this.myProfilePromise = null;
      throw error;
    }
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

function authorFromPerson(person: Person): Promise<ChatUser> {
  return Promise.resolve({
    id: person.id,
    name: person.name,
    initials: person.initials ?? initialsFromName(person.name),
  });
}

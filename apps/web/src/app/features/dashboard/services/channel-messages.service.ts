import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  ChannelMessageListResponseSchema,
  ChannelMessageSchema,
  type ChannelMessage,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';
import { ToastService } from '../../../core/toast/toast.service';
import type { ChatMessage, ChatReaction, ChatUser } from '../../../shared/components/room-chat';
import { initialsFromName } from '../../../shared/components/room-chat';
import { AuthService } from '../../auth/services/auth';

/**
 * Channel message state — backed by the channel-messages REST API
 * (servers/:serverId/channels/:channelId/messages) for reads/writes, plus a
 * Supabase Realtime subscription so messages from other members show up live.
 *
 * Incoming messages are applied to the store the moment their realtime INSERT
 * arrives (the API hydrates `senderId` on every message, so the author is
 * resolved from history), making them appear instantly. A short debounced
 * re-fetch of the active channel's history then reconciles details that the raw
 * row can't carry (reply previews, rolled-up reactions) and keeps the list
 * consistent with what the API maps.
 */
@Injectable({ providedIn: 'root' })
export class ChannelMessagesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly toast = inject(ToastService);
  private readonly ngZone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  private readonly messagesSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly pendingSignal = signal<Record<string, ChatMessage[]>>({});
  private readonly loadingSignal = signal<Record<string, boolean>>({});
  private readonly errorSignal = signal<Record<string, string | null>>({});

  private realtimeChannel: RealtimeChannel | null = null;
  private activeServerId = '';
  private activeChannelId = '';
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;

  /** `messages.sender_id` (channel_members id) → the author, from hydrated history. */
  private senderByMemberId = new Map<string, ChatUser>();

  /** My own `channel_members` id per channel, so own reactions can be skipped in realtime. */
  private readonly myMemberIdByChannel = new Map<string, string>();

  /** The signed-in user's id — own messages / "You" styling. */
  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  messagesFor(channelId: string): ChatMessage[] {
    const persisted = this.messagesSignal()[channelId] ?? [];
    const pending = this.pendingSignal()[channelId] ?? [];
    if (pending.length === 0) return persisted;
    return [...persisted, ...pending].sort(compareChatMessages);
  }

  loadingFor(channelId: string): boolean {
    return this.loadingSignal()[channelId] ?? false;
  }

  errorFor(channelId: string): string | null {
    return this.errorSignal()[channelId] ?? null;
  }

  /**
   * Point the service at the channel on screen: starts the realtime subscription
   * and loads its history. Resolves once the initial history is in the store so
   * the page can scroll to the newest message.
   */
  async setActiveChannel(serverId: string, channelId: string): Promise<void> {
    this.activeServerId = serverId;
    this.activeChannelId = channelId;
    this.subscribeRealtime(serverId, channelId);
    await this.loadMessages(serverId, channelId);
  }

  clearActiveChannel(): void {
    this.unsubscribeRealtime();
    this.activeServerId = '';
    this.activeChannelId = '';
  }

  async loadMessages(serverId: string, channelId: string): Promise<void> {
    if (this.loadingSignal()[channelId]) return;

    this.loadingSignal.update((record) => ({ ...record, [channelId]: true }));
    this.errorSignal.update((record) => ({ ...record, [channelId]: null }));
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(`${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages`),
      );
      const parsed = ChannelMessageListResponseSchema.parse(raw).messages;
      // Remember who each sender is so incoming realtime INSERTs can be applied
      // instantly instead of waiting for a re-fetch.
      this.senderByMemberId = new Map(
        parsed.map((message) => [message.senderId, toChatUser(message.author)]),
      );
      const myId = this.currentUserId();
      const mine = parsed.find((message) => message.author.userId === myId);
      if (mine) this.myMemberIdByChannel.set(channelId, mine.senderId);
      const messages = parsed.map(toChatMessage);
      this.messagesSignal.update((record) => ({ ...record, [channelId]: messages }));
    } catch {
      this.errorSignal.update((record) => ({ ...record, [channelId]: 'Could not load messages.' }));
    } finally {
      this.loadingSignal.update((record) => ({ ...record, [channelId]: false }));
    }
  }

  /** Persist a message via POST, then append it to local state. */
  async sendMessage(
    serverId: string,
    channelId: string,
    text: string,
    replyToMessageId: string | null,
  ): Promise<void> {
    const content = text.trim();
    if (!content) return;

    // Optimistically show the message as "sending" before the POST round-trip,
    // then swap it for the server-confirmed row once it lands.
    const pending = this.buildPendingMessage(channelId, content, replyToMessageId);
    this.pendingSignal.update((record) => ({
      ...record,
      [channelId]: [...(record[channelId] ?? []), pending],
    }));

    try {
      const raw = await firstValueFrom(
        this.http.post<unknown>(
          `${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages`,
          { content, replyToMessageId },
        ),
      );
      const created = ChannelMessageSchema.parse(raw);
      this.senderByMemberId.set(created.senderId, toChatUser(created.author));
      this.myMemberIdByChannel.set(channelId, created.senderId);
      this.messagesSignal.update((record) => {
        const existing = record[channelId] ?? [];
        const message = toChatMessage(created);
        // A realtime refetch may have already included this message in history.
        return {
          ...record,
          [channelId]: existing.some((item) => item.id === message.id)
            ? existing
            : [...existing, message],
        };
      });
      this.pendingSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).filter((item) => item.id !== pending.id),
      }));
    } catch {
      this.pendingSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).map((item) =>
          item.id === pending.id ? { ...item, pending: false, failed: true } : item,
        ),
      }));
      this.toast.error('Could not send the message.');
    }
  }

  /** Persist an edit via PATCH, then replace the local message (rolls back on failure). */
  async editMessage(
    serverId: string,
    channelId: string,
    messageId: string,
    newText: string,
  ): Promise<boolean> {
    const content = newText.trim();
    if (!content) return false;

    try {
      const raw = await firstValueFrom(
        this.http.patch<unknown>(
          `${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages/${messageId}`,
          { content },
        ),
      );
      const updated = ChannelMessageSchema.parse(raw);
      this.messagesSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).map((message) =>
          message.id === messageId ? toChatMessage(updated) : message,
        ),
      }));
      return true;
    } catch {
      this.toast.error('Could not edit the message.');
      return false;
    }
  }

  /** Soft-delete via DELETE, then drop it from local state. */
  async deleteMessage(serverId: string, channelId: string, messageId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete<unknown>(
          `${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages/${messageId}`,
        ),
      );
      this.messagesSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).filter((message) => message.id !== messageId),
      }));
    } catch {
      this.toast.error('Could not delete the message.');
    }
  }

  /**
   * Add/remove the current user's reaction. The chip updates optimistically so
   * the click feels instant; the API then returns the message with the
   * authoritative reaction summary, which replaces the local copy (rolled back
   * if the request fails).
   */
  async toggleReaction(
    serverId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const current = (this.messagesSignal()[channelId] ?? []).find(
      (message) => message.id === messageId,
    );
    if (!current) return;

    const reacting = current.ownReaction !== emoji;
    const url = `${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages/${messageId}/reaction`;
    const optimistic = { ...current, ...this.optimisticReactions(current, emoji) };

    this.messagesSignal.update((record) => ({
      ...record,
      [channelId]: (record[channelId] ?? []).map((message) =>
        message.id === messageId ? optimistic : message,
      ),
    }));

    try {
      const raw = reacting
        ? await firstValueFrom(this.http.put<unknown>(url, { emoji }))
        : await firstValueFrom(this.http.delete<unknown>(url, { params: { emoji } }));
      const updated = ChannelMessageSchema.parse(raw);
      this.messagesSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).map((message) =>
          message.id === messageId ? toChatMessage(updated) : message,
        ),
      }));
    } catch {
      this.messagesSignal.update((record) => ({
        ...record,
        [channelId]: (record[channelId] ?? []).map((message) =>
          message.id === messageId ? current : message,
        ),
      }));
      this.toast.error('Could not update the reaction.');
    }
  }

  /**
   * Compute the local reaction chips + ownReaction for the click before the API
   * confirms. Adding: bumps the emoji count (and steps off any previous emoji).
   * Removing: decrements the emoji count, dropping the chip at zero.
   */
  private optimisticReactions(
    message: ChatMessage,
    emoji: string,
  ): { reactions: ChatReaction[]; ownReaction: string | null } {
    const reactions = message.reactions.map((reaction) => ({ ...reaction }));

    if (message.ownReaction !== emoji) {
      if (message.ownReaction) {
        const previous = reactions.find((reaction) => reaction.emoji === message.ownReaction);
        if (previous) {
          previous.count -= 1;
          previous.reactedByMe = false;
        }
      }
      const target = reactions.find((reaction) => reaction.emoji === emoji);
      if (target) {
        target.count += 1;
        target.reactedByMe = true;
      } else {
        reactions.push({ emoji, count: 1, reactedByMe: true });
      }
      return { reactions, ownReaction: emoji };
    }

    const target = reactions.find((reaction) => reaction.emoji === emoji);
    if (target) {
      target.count -= 1;
      target.reactedByMe = false;
    }
    return {
      reactions: reactions.filter((reaction) => reaction.count > 0),
      ownReaction: null,
    };
  }

  // -------------------------------------------------------------------
  // Optimistic pending
  // -------------------------------------------------------------------

  /** Build the instant "sending…" placeholder shown before the POST confirms. */
  private buildPendingMessage(
    channelId: string,
    content: string,
    replyToMessageId: string | null,
  ): ChatMessage {
    const userId = this.currentUserId();
    const existing = (this.messagesSignal()[channelId] ?? []).find(
      (message) => message.author.id === userId,
    );
    const author: ChatUser = existing
      ? existing.author
      : { id: userId, name: 'You', initials: initialsFromName('You') };
    const target = replyToMessageId
      ? (this.messagesSignal()[channelId] ?? []).find((message) => message.id === replyToMessageId)
      : null;

    return {
      id: `pending:${crypto.randomUUID()}`,
      author,
      text: content,
      createdAt: new Date().toISOString(),
      reactions: [],
      ownReaction: null,
      reply: target
        ? { messageId: target.id, authorName: target.author.name, text: target.text }
        : null,
      edited: false,
      deleted: false,
      pending: true,
      failed: false,
    };
  }

  // -------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------

  private subscribeRealtime(serverId: string, channelId: string): void {
    this.unsubscribeRealtime();

    // Re-fetch on any relevant change. `messages` events are scoped to this
    // channel; `message_reactions` events are scoped to this channel too.
    this.realtimeChannel = this.supabaseSession.client
      .channel(`channel-messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          this.ngZone.run(() => this.applyIncomingInsert(payload));
          this.scheduleRefetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          this.ngZone.run(() => this.applyIncomingReaction(payload));
          this.scheduleRefetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          this.ngZone.run(() => this.applyIncomingReaction(payload));
          this.scheduleRefetch();
        },
      )
      .subscribe();
  }

  /**
   * Show an incoming message the instant its realtime INSERT lands. The author
   * comes from the hydrated history's sender map; the short refetch afterwards
   * fills in reply previews and reactions.
   */
  private applyIncomingInsert(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    const row = payload.new;
    const channelId = this.activeChannelId;
    if (!channelId || !isMessageRow(row) || row.channel_id !== channelId || row.deleted_at) {
      return;
    }

    const author = this.senderByMemberId.get(row.sender_id);
    if (!author) return; // Unknown sender — the refetch will add it.

    const confirmed: ChatMessage = {
      id: row.id,
      author,
      text: row.content,
      createdAt: row.created_at,
      reactions: [],
      ownReaction: null,
      reply: null,
      edited: row.edited_at !== null,
      deleted: false,
      pending: false,
      failed: false,
    };

    // The INSERT may be the server's confirmation of our own optimistic
    // pending message — swap it in so it stops showing as "sending".
    this.pendingSignal.update((record) => ({
      ...record,
      [channelId]: (record[channelId] ?? []).filter(
        (item) => !(item.pending && item.author.id === author.id && item.text === row.content),
      ),
    }));

    this.messagesSignal.update((record) => {
      const existing = record[channelId] ?? [];
      if (existing.some((item) => item.id === row.id)) return record;
      return { ...record, [channelId]: [...existing, confirmed] };
    });
  }

  /**
   * Apply another member's reaction the instant its realtime event lands, so
   * chips update without waiting for the debounced history refetch. My own
   * reactions are skipped here — they're already applied optimistically and
   * reconciled by the PUT/DELETE response.
   */
  private applyIncomingReaction(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    const channelId = this.activeChannelId;
    const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
    if (!channelId || !isReactionRow(row) || row.channel_id !== channelId) return;

    // Skip our own reactions (handled by the optimistic toggle + API response).
    if (this.myMemberIdByChannel.get(channelId) === row.channel_member_id) return;
    if (this.senderByMemberId.get(row.channel_member_id)?.id === this.currentUserId()) return;

    const add = payload.eventType === 'INSERT';
    const emoji = row.emoji;

    this.messagesSignal.update((record) => {
      const messages = record[channelId];
      if (!messages) return record;
      return {
        ...record,
        [channelId]: messages.map((message) => {
          if (message.id !== row.message_id) return message;
          const reactions = message.reactions.map((reaction) => ({ ...reaction }));
          const existing = reactions.find((reaction) => reaction.emoji === emoji);
          if (add) {
            if (existing) {
              existing.count += 1;
            } else {
              reactions.push({ emoji, count: 1, reactedByMe: false });
            }
          } else if (existing) {
            existing.count -= 1;
          }
          return { ...message, reactions: reactions.filter((reaction) => reaction.count > 0) };
        }),
      };
    });
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeChannel) {
      void this.supabaseSession.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.refetchTimer) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
  }

  /** Debounced re-fetch of the active channel, inside Angular's zone. */
  private scheduleRefetch(): void {
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      if (this.activeChannelId) {
        this.ngZone.run(() => {
          void this.loadMessages(this.activeServerId, this.activeChannelId);
        });
      }
    }, 100);
  }
}

function compareChatMessages(left: ChatMessage, right: ChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

/** Map the API's author profile onto the presentational ChatUser shape. */
function toChatUser(author: ChannelMessage['author']): ChatUser {
  return {
    id: author.userId,
    name: author.displayName,
    avatarUrl: author.avatarUrl,
    initials: initialsFromName(author.displayName),
  };
}

/** Map the API's hydrated message onto the presentational ChatMessage shape. */
function toChatMessage(message: ChannelMessage): ChatMessage {
  const author = toChatUser(message.author);

  const reactions = [...message.reactions].sort((a, b) => b.count - a.count);

  return {
    id: message.id,
    author,
    text: message.content,
    createdAt: message.createdAt,
    reactions: reactions.map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      reactedByMe: reaction.reactedByMe,
    })),
    ownReaction: reactions.find((reaction) => reaction.reactedByMe)?.emoji ?? null,
    reply: message.replyTo
      ? {
          messageId: message.replyTo.id,
          authorName: message.replyTo.author.displayName,
          text: message.replyTo.content,
        }
      : null,
    edited: message.editedAt !== null,
    deleted: false,
    pending: false,
    failed: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Shape-check a realtime `messages` row so payload typos can't crash the store. */
function isMessageRow(value: unknown): value is {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
} {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['channel_id'] === 'string' &&
    typeof value['sender_id'] === 'string' &&
    typeof value['content'] === 'string' &&
    typeof value['created_at'] === 'string'
  );
}

/** Shape-check a realtime `message_reactions` row (INSERT `new` / DELETE `old`). */
function isReactionRow(value: unknown): value is {
  channel_id: string;
  message_id: string;
  channel_member_id: string;
  emoji: string;
} {
  return (
    isRecord(value) &&
    typeof value['channel_id'] === 'string' &&
    typeof value['message_id'] === 'string' &&
    typeof value['channel_member_id'] === 'string' &&
    typeof value['emoji'] === 'string'
  );
}

import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ChannelMessageListResponseSchema,
  ChannelMessageSchema,
  type ChannelMessage,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';
import { ToastService } from '../../../core/toast/toast.service';
import type { ChatMessage, ChatUser } from '../../../shared/components/room-chat';
import { initialsFromName } from '../../../shared/components/room-chat';
import { AuthService } from '../../auth/services/auth';

/**
 * Channel message state — backed by the channel-messages REST API
 * (servers/:serverId/channels/:channelId/messages) for reads/writes, plus a
 * Supabase Realtime subscription so messages from other members show up live.
 *
 * The API already returns fully-hydrated messages (author profile, reply
 * preview, rolled-up reactions), so instead of mapping raw `messages` rows like
 * the DM service does, a realtime event just re-fetches the active channel's
 * history (debounced). Correct at any scale this app cares about, and immune to
 * drift between what the API maps and what a raw row would need.
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
  private readonly loadingSignal = signal<Record<string, boolean>>({});
  private readonly errorSignal = signal<Record<string, string | null>>({});

  private realtimeChannel: RealtimeChannel | null = null;
  private activeServerId = '';
  private activeChannelId = '';
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;

  /** The signed-in user's id — own messages / "You" styling. */
  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  messagesFor(channelId: string): ChatMessage[] {
    return this.messagesSignal()[channelId] ?? [];
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
      const messages = ChannelMessageListResponseSchema.parse(raw).messages.map(toChatMessage);
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

    try {
      const raw = await firstValueFrom(
        this.http.post<unknown>(
          `${this.apiUrl}/servers/${serverId}/channels/${channelId}/messages`,
          { content, replyToMessageId },
        ),
      );
      const created = ChannelMessageSchema.parse(raw);
      this.messagesSignal.update((record) => ({
        ...record,
        [channelId]: [...(record[channelId] ?? []), toChatMessage(created)],
      }));
    } catch {
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
   * Add/remove the current user's reaction. The API returns the message with
   * the updated reaction summary, which replaces the local copy wholesale.
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
      this.toast.error('Could not update the reaction.');
    }
  }

  // -------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------

  private subscribeRealtime(serverId: string, channelId: string): void {
    this.unsubscribeRealtime();

    // Re-fetch on any relevant change. `messages` events are scoped to this
    // channel; `message_reactions` has no channel_id column, so reaction
    // events are un-filtered — the debounce + per-channel store keep that cheap.
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
        () => this.scheduleRefetch(),
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
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        () => this.scheduleRefetch(),
      )
      .subscribe();
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
    }, 250);
  }
}

/** Map the API's hydrated message onto the presentational ChatMessage shape. */
function toChatMessage(message: ChannelMessage): ChatMessage {
  const author: ChatUser = {
    id: message.author.userId,
    name: message.author.displayName,
    avatarUrl: message.author.avatarUrl,
    initials: initialsFromName(message.author.displayName),
  };

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

import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import {
  ChannelSchema,
  ChatMessageBroadcastSchema,
  ChatMessagePayloadSchema,
  DeleteMessagePayloadSchema,
  JoinChannelPayloadSchema,
  LeaveChannelPayloadSchema,
  MemberListSchema,
  MessageDeletedBroadcastSchema,
  MessageReactionBroadcastSchema,
  MessageReactionPayloadSchema,
  MessageHistorySchema,
  SOCKET_EVENTS,
  type Channel,
  type Member,
  type Message,
} from '@lobby/shared';
import { environment } from '../../../environments/environment';
import type { ChatMessage, ChatReaction, ChatUser } from '../components/room-chat';

type MessageReactionState = {
  counts: Record<string, number>;
  byUser: Record<string, string>;
};

/**
 * Real channel chat data for the reusable <app-room-chat> panel: loads channel
 * + message history over REST, then joins the channel socket for live
 * messages / reactions / deletions / presence. Presentational pages (call
 * room, guest room) consume the signals and forward the action methods.
 */
@Injectable({ providedIn: 'root' })
export class ChannelChatService {
  private readonly http = inject(HttpClient);

  private socket: Socket | null = null;
  private channelIdValue = '';

  private readonly _channel = signal<Channel | null>(null);
  private readonly _messages = signal<Message[]>([]);
  private readonly _members = signal<Member[]>([]);
  private readonly _connected = signal(false);
  private readonly _displayName = signal('');
  private readonly _chatError = signal<string | null>(null);
  private readonly _messageReactions = signal<Record<string, MessageReactionState>>({});

  readonly channel = this._channel.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly members = this._members.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly displayName = this._displayName.asReadonly();
  readonly chatError = this._chatError.asReadonly();

  readonly chatMessages = computed<ChatMessage[]>(() =>
    this._messages().map((message) => this.toChatMessage(message)),
  );

  /** room-chat's `currentUserId` — guest identity is the display name. */
  readonly currentUser = computed<ChatUser>(() => ({
    id: this._displayName(),
    name: this._displayName(),
  }));

  readonly memberNames = computed<string[]>(() =>
    this._members()
      .map((member) => member.name.trim())
      .filter(Boolean),
  );

  /** Fetches channel + history, then opens the socket. Throws on failure. */
  async join(channelId: string, name: string): Promise<void> {
    this.channelIdValue = channelId;
    this._displayName.set(name);
    this._chatError.set(null);

    const channelResponse = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl()}/channels/${channelId}`),
    );
    this._channel.set(ChannelSchema.parse(channelResponse));

    const historyResponse = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl()}/channels/${channelId}/messages`),
    );
    const history = MessageHistorySchema.parse(historyResponse);
    this._messages.set(history.messages);
    this._messageReactions.set(this.hydrateReactionState(history.messages));

    this.connectSocket(channelId);
  }

  send(text: string): void {
    if (!this.socket?.connected) {
      return;
    }
    this.socket.emit(
      SOCKET_EVENTS.CHAT_MESSAGE,
      ChatMessagePayloadSchema.parse({
        channelId: this.channelIdValue,
        name: this._displayName(),
        text,
      }),
    );
  }

  react(messageId: string, emoji: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const reactedBy = this._displayName();
    const userKey = reactedBy.trim().toLocaleLowerCase();
    const removing = this._messageReactions()[messageId]?.byUser[userKey] === emoji;

    this.applyReactionUpdate(messageId, reactedBy, emoji, removing);
    this.socket.emit(
      SOCKET_EVENTS.MESSAGE_REACTION,
      MessageReactionPayloadSchema.parse({
        channelId: this.channelIdValue,
        messageId,
        emoji,
      }),
    );
  }

  deleteMessage(messageId: string): void {
    this.removeMessageLocally(messageId);

    if (this.socket?.connected) {
      this.socket.emit(
        SOCKET_EVENTS.DELETE_MESSAGE,
        DeleteMessagePayloadSchema.parse({
          channelId: this.channelIdValue,
          messageId,
        }),
      );
    }
  }

  leave(): void {
    const socket = this.socket;
    this.socket = null;
    const channelId = this.channelIdValue || (this._channel()?.id ?? '');
    this.channelIdValue = '';
    this._members.set([]);
    this._connected.set(false);
    this._chatError.set(null);

    if (!socket) {
      return;
    }

    if (socket.connected) {
      socket.emit(SOCKET_EVENTS.LEAVE_CHANNEL, LeaveChannelPayloadSchema.parse({ channelId }));
    }
    socket.disconnect();
  }

  private connectSocket(channelId: string): void {
    const socket = io(environment.apiUrl || undefined);
    this.socket = socket;

    socket.on('connect', () => {
      socket.emit(
        SOCKET_EVENTS.JOIN_CHANNEL,
        JoinChannelPayloadSchema.parse({ channelId, name: this._displayName() }),
      );
    });

    socket.on('disconnect', () => {
      this._connected.set(false);
      this._members.set([]);
    });

    socket.on(SOCKET_EVENTS.MEMBER_LIST, (raw: unknown) => {
      this._members.set(MemberListSchema.parse(raw).members);
      this._connected.set(true);
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (raw: unknown) => {
      this._messages.update((current) => [...current, ChatMessageBroadcastSchema.parse(raw)]);
    });

    socket.on(SOCKET_EVENTS.MESSAGE_REACTION, (raw: unknown) => {
      const reaction = MessageReactionBroadcastSchema.parse(raw);
      this.applyReactionUpdate(
        reaction.messageId,
        reaction.reactedBy,
        reaction.emoji,
        reaction.removed,
      );
    });

    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, (raw: unknown) => {
      this.removeMessageLocally(MessageDeletedBroadcastSchema.parse(raw).messageId);
    });

    socket.on('exception', (err: { message?: string }) => {
      this._chatError.set(err.message ?? 'The channel disconnected unexpectedly.');
    });
  }

  private toChatMessage(message: Message): ChatMessage {
    const state = this._messageReactions()[message.id];
    const ownReaction = state?.byUser[this.currentReactionUserKey()] ?? null;

    const reactions: ChatReaction[] = state
      ? Object.entries(state.counts)
          .map(([emoji, count]) => ({ emoji, count, reactedByMe: ownReaction === emoji }))
          .sort((a, b) => b.count - a.count)
      : [];

    return {
      id: message.id,
      author: { id: message.authorName, name: message.authorName },
      text: message.text,
      createdAt: message.createdAt,
      reactions,
      ownReaction,
    };
  }

  private applyReactionUpdate(
    messageId: string,
    reactedBy: string,
    emoji: string,
    removed = false,
  ): void {
    const userKey = reactedBy.trim().toLocaleLowerCase();

    this._messageReactions.update((current) => {
      const existing = current[messageId] ?? { counts: {}, byUser: {} };
      const currentEmoji = existing.byUser[userKey];
      const nextCounts = { ...existing.counts };

      if (removed) {
        if (currentEmoji) {
          const decremented = (nextCounts[currentEmoji] ?? 1) - 1;
          if (decremented <= 0) {
            delete nextCounts[currentEmoji];
          } else {
            nextCounts[currentEmoji] = decremented;
          }
        }

        const nextByUser = { ...existing.byUser };
        delete nextByUser[userKey];

        return {
          ...current,
          [messageId]: { counts: nextCounts, byUser: nextByUser },
        };
      }

      if (currentEmoji === emoji) {
        return current;
      }

      if (currentEmoji) {
        const decremented = (nextCounts[currentEmoji] ?? 1) - 1;
        if (decremented <= 0) {
          delete nextCounts[currentEmoji];
        } else {
          nextCounts[currentEmoji] = decremented;
        }
      }

      nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;

      return {
        ...current,
        [messageId]: {
          counts: nextCounts,
          byUser: {
            ...existing.byUser,
            [userKey]: emoji,
          },
        },
      };
    });
  }

  private hydrateReactionState(messages: Message[]): Record<string, MessageReactionState> {
    const nextState: Record<string, MessageReactionState> = {};

    for (const message of messages) {
      const reactions = Array.isArray(message.reactions) ? message.reactions : [];

      for (const reaction of reactions) {
        const messageState =
          nextState[message.id] ?? ({ counts: {}, byUser: {} } satisfies MessageReactionState);

        const userKey = reaction.reactedBy.trim().toLocaleLowerCase();
        messageState.byUser[userKey] = reaction.emoji;
        messageState.counts[reaction.emoji] = (messageState.counts[reaction.emoji] ?? 0) + 1;
        nextState[message.id] = messageState;
      }
    }

    return nextState;
  }

  private removeMessageLocally(messageId: string): void {
    this._messages.update((current) => current.filter((message) => message.id !== messageId));
    this._messageReactions.update((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  private currentReactionUserKey(): string {
    return this._displayName().trim().toLocaleLowerCase() || 'guest';
  }

  private apiUrl(): string {
    return environment.apiUrl.replace(/\/$/, '');
  }
}

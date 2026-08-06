import { computed, Injectable, signal } from '@angular/core';
import type { Person } from '../../shared/components/person-avatar/person.model';
import type { ChatMessage, ChatReaction, ChatUser } from '../../shared/components/room-chat';
import type { Conversation, ConversationRow } from './messages.models';
import {
  CURRENT_USER,
  mockConversations,
  mockMessages,
  mockPartners,
} from './mock-data/messages.mock';

/**
 * Direct messages feature state — local, in-memory mock store.
 *
 * Conversations are keyed by `friendId`; messages are shared `ChatMessage`
 * objects. Every method mutates signals only (no network I/O). When the
 * backend ships, swap the method bodies for HTTP calls and keep this exact
 * public surface so the Messages page / MessageRow don't change.
 */
@Injectable({ providedIn: 'root' })
export class DirectMessagesService {
  private readonly conversationsSignal = signal<Conversation[]>(mockConversations);
  private readonly messagesSignal = signal<Record<string, ChatMessage[]>>(mockMessages);
  private readonly partnersSignal = signal<Record<string, Person>>(mockPartners);

  /** The signed-in user's id — own messages / "You" styling. */
  readonly currentUserId = CURRENT_USER.id;

  private seq = 0;

  /** Sidebar rows, sorted most-recent-first, with partner + last-message preview. */
  readonly conversationRows = computed<ConversationRow[]>(() => {
    const messages = this.messagesSignal();
    return this.conversationsSignal()
      .map((conversation) => {
        const conversationMessages = messages[conversation.friendId] ?? [];
        const last = conversationMessages[conversationMessages.length - 1];
        return {
          friendId: conversation.friendId,
          unread: conversation.unread,
          lastMessageAt: last?.createdAt ?? conversation.lastMessageAt,
          partner: this.partnersSignal()[conversation.friendId],
          preview: last?.text ?? '',
        };
      })
      .filter((row): row is ConversationRow => !!row.partner)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  });

  readonly totalUnread = computed(() =>
    this.conversationRows().reduce((sum, row) => sum + row.unread, 0),
  );

  conversationFor(friendId: string): ConversationRow | undefined {
    return this.conversationRows().find((row) => row.friendId === friendId);
  }

  partnerFor(friendId: string): Person | undefined {
    return this.partnersSignal()[friendId];
  }

  messagesFor(friendId: string): ChatMessage[] {
    return this.messagesSignal()[friendId] ?? [];
  }

  /** Send a message (optionally a reply quoting another message). Local only. */
  send(friendId: string, text: string, replyTo?: ChatMessage['replyTo']): void {
    const content = text.trim();
    if (!content) {
      return;
    }
    const message: ChatMessage = {
      id: `dm-${Date.now()}-${this.seq++}`,
      author: this.currentAuthor(),
      text: content,
      createdAt: new Date().toISOString(),
      reactions: [],
      ownReaction: null,
      replyTo,
    };
    this.messagesSignal.update((store) => ({
      ...store,
      [friendId]: [...(store[friendId] ?? []), message],
    }));
    this.markRead(friendId);
  }

  /** Update a message's text and flag it as edited (only when it actually changed). */
  editMessage(friendId: string, messageId: string, newText: string): void {
    const content = newText.trim();
    if (!content) {
      return;
    }
    this.messagesSignal.update((store) => ({
      ...store,
      [friendId]: (store[friendId] ?? []).map((message) =>
        message.id === messageId && message.text !== content
          ? { ...message, text: content, edited: true }
          : message,
      ),
    }));
  }

  /** Remove a message from local state. */
  deleteMessage(friendId: string, messageId: string): void {
    this.messagesSignal.update((store) => ({
      ...store,
      [friendId]: (store[friendId] ?? []).filter((message) => message.id !== messageId),
    }));
  }

  /** Toggle the current user's reaction on a message (adds / removes the chip). */
  toggleReaction(friendId: string, messageId: string, emoji: string): void {
    this.messagesSignal.update((store) => ({
      ...store,
      [friendId]: (store[friendId] ?? []).map((message) =>
        message.id === messageId ? applyReaction(message, emoji) : message,
      ),
    }));
  }

  /** Clear the unread badge for a conversation. */
  markRead(friendId: string): void {
    this.conversationsSignal.update((list) =>
      list.map((conversation) =>
        conversation.friendId === friendId ? { ...conversation, unread: 0 } : conversation,
      ),
    );
  }

  private currentAuthor(): ChatUser {
    return {
      id: CURRENT_USER.id,
      name: CURRENT_USER.name,
      initials: CURRENT_USER.initials,
      avatarColor: CURRENT_USER.color,
    };
  }
}

/** Recompute the reaction chips after toggling the current user's emoji. */
function applyReaction(message: ChatMessage, emoji: string): ChatMessage {
  const previous = message.ownReaction;
  const nextOwn = previous === emoji ? null : emoji;

  const counts = new Map<string, number>();
  for (const reaction of message.reactions) {
    counts.set(reaction.emoji, reaction.count);
  }
  if (previous !== null && previous !== nextOwn) {
    counts.set(previous, Math.max((counts.get(previous) ?? 1) - 1, 0));
  }
  if (nextOwn !== null) {
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  }

  const reactions: ChatReaction[] = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([reactionEmoji, count]) => ({
      emoji: reactionEmoji,
      count,
      reactedByMe: reactionEmoji === nextOwn,
    }))
    .sort((a, b) => b.count - a.count);

  return { ...message, ownReaction: nextOwn, reactions };
}

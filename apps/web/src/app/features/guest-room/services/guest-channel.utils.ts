import type { GuestMessage, GuestMessageReaction } from '../../../core/supabase/database.types';
import type { ChatReaction } from '../../../shared/components/room-chat';

export function reactionKey(reaction: GuestMessageReaction): string {
  return `${reaction.message_id}:${reaction.member_id}:${reaction.emoji}`;
}

export function sortMessages(messages: GuestMessage[]): GuestMessage[] {
  return [...messages].sort(
    (left, right) =>
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  );
}

export function mergeMessages(messages: GuestMessage[], row: GuestMessage): GuestMessage[] {
  return sortMessages([
    ...messages.filter(
      (message) =>
        message.id !== row.id &&
        (!row.client_message_id || message.client_message_id !== row.client_message_id),
    ),
    row,
  ]);
}

export function aggregateReactions(
  reactions: GuestMessageReaction[],
  currentMemberId: string | null,
): ChatReaction[] {
  const unique = new Map<string, GuestMessageReaction>();
  for (const reaction of reactions) unique.set(reactionKey(reaction), reaction);

  const grouped = new Map<string, ChatReaction>();
  for (const reaction of unique.values()) {
    const current = grouped.get(reaction.emoji);
    grouped.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: (current?.count ?? 0) + 1,
      reactedByMe: current?.reactedByMe === true || reaction.member_id === currentMemberId,
    });
  }
  return [...grouped.values()].sort(
    (left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji),
  );
}

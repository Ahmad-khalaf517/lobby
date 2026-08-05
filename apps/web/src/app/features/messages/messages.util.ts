import type { Person } from '../../shared/components/person-avatar/person.model';
import type { ChatUser } from '../../shared/components/room-chat';

/** Map the shared `ChatUser` message author onto a `Person` for avatar rendering. */
export function authorToPerson(author: ChatUser): Person {
  return {
    id: author.id,
    name: author.name,
    initials: author.initials,
    color: author.avatarColor,
    status: author.status,
  };
}

/** Render an ISO timestamp as a short clock time (e.g. "7:42 PM"). */
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

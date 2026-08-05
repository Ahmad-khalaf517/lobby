import type { Person } from '../../../shared/components/person-avatar/person.model';
import type { ChatMessage, ChatUser } from '../../../shared/components/room-chat';
import type { Conversation } from '../messages.models';

/**
 * Mock data for the direct messages feature.
 *
 * Static, in-memory stand-ins for the backend conversations + messages tables.
 * The message list reuses the shared `ChatMessage` UI shape, so swapping these
 * for real API responses later only touches `DirectMessagesService`.
 */

/** The signed-in user (author of every "You" message). */
export const CURRENT_USER: Person = {
  id: 'user-mohammad',
  name: 'Mohammad',
  initials: 'MH',
  color: '#7c5cfc',
  textColor: '#0b0d13',
};

function author(id: string, name: string, initials: string, avatarColor: string): ChatUser {
  return { id, name, initials, avatarColor };
}

const me: ChatUser = author(CURRENT_USER.id, 'Mohammad', 'MH', '#7c5cfc');
const nada = author('user-nada', 'Nada', 'NA', '#10b981');
const lina = author('user-lina', 'Lina', 'LI', '#f472b6');
const youssef = author('user-youssef', 'Youssef', 'YA', '#fb923c');
const hana = author('user-hana', 'Hana', 'HA', '#14b8a6');
const omar = author('user-omar', 'Omar', 'OM', '#f59e0b');

/** Conversation partners (name + avatar presence for the sidebar / chat header). */
export const mockPartners: Record<string, Person> = {
  'user-nada': {
    id: 'user-nada',
    name: 'Nada',
    initials: 'NA',
    color: '#10b981',
    status: 'online',
  },
  'user-lina': {
    id: 'user-lina',
    name: 'Lina',
    initials: 'LI',
    color: '#f472b6',
    status: 'offline',
    lastSeen: '5m ago',
  },
  'user-youssef': {
    id: 'user-youssef',
    name: 'Youssef',
    initials: 'YA',
    color: '#fb923c',
    status: 'offline',
    lastSeen: '2h ago',
  },
  'user-hana': {
    id: 'user-hana',
    name: 'Hana',
    initials: 'HA',
    color: '#14b8a6',
    status: 'online',
  },
  'user-omar': {
    id: 'user-omar',
    name: 'Omar',
    initials: 'OM',
    color: '#f59e0b',
    status: 'online',
  },
};

export const mockConversations: Conversation[] = [
  { friendId: 'user-nada', unread: 0, lastMessageAt: '2026-08-05T19:42:00.000Z' },
  { friendId: 'user-lina', unread: 2, lastMessageAt: '2026-08-05T18:15:00.000Z' },
  { friendId: 'user-hana', unread: 1, lastMessageAt: '2026-08-05T17:30:00.000Z' },
  { friendId: 'user-youssef', unread: 0, lastMessageAt: '2026-08-05T16:20:00.000Z' },
  { friendId: 'user-omar', unread: 0, lastMessageAt: '2026-08-04T21:10:00.000Z' },
];

export const mockMessages: Record<string, ChatMessage[]> = {
  'user-nada': [
    {
      id: 'dm-nada-1',
      author: nada,
      text: 'The room link worked, I joined without an account.',
      createdAt: '2026-08-05T19:18:00.000Z',
      reactions: [
        { emoji: '👍', count: 2, reactedByMe: false },
        { emoji: '🎉', count: 1, reactedByMe: false },
      ],
      ownReaction: null,
    },
    {
      id: 'dm-nada-2',
      author: me,
      text: "Perfect, share your screen when you're ready.",
      createdAt: '2026-08-05T19:20:00.000Z',
      edited: true,
      replyTo: {
        messageId: 'dm-nada-1',
        authorName: 'Nada',
        text: 'The room link worked, I joined without an account.',
      },
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-nada-3',
      author: nada,
      text: 'Want to hop on a quick call about the sprint board?',
      createdAt: '2026-08-05T19:41:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-nada-4',
      author: me,
      text: 'Sure, calling now',
      createdAt: '2026-08-05T19:42:00.000Z',
      reactions: [],
      ownReaction: null,
    },
  ],
  'user-lina': [
    {
      id: 'dm-lina-1',
      author: lina,
      text: 'Thanks for the invite!',
      createdAt: '2026-08-05T18:10:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-lina-2',
      author: me,
      text: 'You got it — see you there 🎉',
      createdAt: '2026-08-05T18:12:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-lina-3',
      author: lina,
      text: 'The design mockup looks amazing',
      createdAt: '2026-08-05T18:14:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-lina-4',
      author: lina,
      text: 'Can we review it together tomorrow morning?',
      createdAt: '2026-08-05T18:15:00.000Z',
      reactions: [],
      ownReaction: null,
    },
  ],
  'user-hana': [
    {
      id: 'dm-hana-1',
      author: hana,
      text: 'Did you push the friends feature yet?',
      createdAt: '2026-08-05T17:20:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-hana-2',
      author: me,
      text: 'Almost done — testing now',
      createdAt: '2026-08-05T17:25:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-hana-3',
      author: hana,
      text: 'Sweet, the list looks great',
      createdAt: '2026-08-05T17:30:00.000Z',
      reactions: [],
      ownReaction: null,
    },
  ],
  'user-youssef': [
    {
      id: 'dm-youssef-1',
      author: youssef,
      text: 'on my way',
      createdAt: '2026-08-05T16:20:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-youssef-2',
      author: me,
      text: 'Great, see you in the studio',
      createdAt: '2026-08-05T16:22:00.000Z',
      reactions: [],
      ownReaction: null,
    },
  ],
  'user-omar': [
    {
      id: 'dm-omar-1',
      author: omar,
      text: 'Lobby game night this Friday?',
      createdAt: '2026-08-04T21:10:00.000Z',
      reactions: [],
      ownReaction: null,
    },
    {
      id: 'dm-omar-2',
      author: me,
      text: "I'm in!",
      createdAt: '2026-08-04T21:11:00.000Z',
      reactions: [],
      ownReaction: null,
    },
  ],
};

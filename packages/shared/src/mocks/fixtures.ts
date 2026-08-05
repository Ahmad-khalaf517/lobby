/**
 * Fixture data conforming to the shared schemas. Use these to build and test
 * frontend UI (or backend unit tests) before the real implementation on the
 * other side exists — this is what lets all five people start on day 1
 * without waiting on each other. See docs/ARCHITECTURE.md "Parallel
 * development" section for how this fits into the workflow.
 */
import type { Channel } from '../schemas/channel.schema.js';
import type { Message } from '../schemas/chat.schema.js';
import type { Member } from '../schemas/presence.schema.js';
import type { CallTokenResponse } from '../schemas/call.schema.js';

export const mockChannel: Channel = {
  id: 'LBY-7X3Q',
  name: 'Frontend sprint',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

export const mockMembers: Member[] = [
  { name: 'Mohammad', socketId: 'sock_1' },
  { name: 'Nada', socketId: 'sock_2' },
  { name: 'Youssef', socketId: 'sock_3' },
];

export const mockMessages: Message[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    channelId: 'LBY-7X3Q',
    authorName: 'Nada',
    text: 'The room link worked, I joined without an account.',
    reactions: [],
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    channelId: 'LBY-7X3Q',
    authorName: 'Youssef',
    text: "Perfect, share your screen when you're ready.",
    reactions: [],
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
];

/** Fake call token response — enough to build/test the Call UI without a real LiveKit project. */
export const mockCallTokenResponse: CallTokenResponse = {
  token: 'mock.jwt.token',
  livekitUrl: 'wss://mock-project.livekit.cloud',
  roomName: 'LBY-7X3Q',
};

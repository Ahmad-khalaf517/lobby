/**
 * Fixture data conforming to the shared schemas. Use these to build and test
 * frontend UI (or backend unit tests) before the real implementation on the
 * other side exists — this is what lets all five people start on day 1
 * without waiting on each other. See docs/ARCHITECTURE.md "Parallel
 * development" section for how this fits into the workflow.
 */
import type { Channel } from '../schemas/channel.schema.js';
import type { ChatMessageBroadcast } from '../schemas/chat.schema.js';
import type { Member } from '../schemas/presence.schema.js';
import type { CallTokenResponse } from '../schemas/call.schema.js';

export const mockChannel: Channel = {
  id: 'ch_demo123',
  name: 'general',
  createdAt: new Date().toISOString(),
};

export const mockMembers: Member[] = [
  { name: 'Alice', socketId: 'sock_1' },
  { name: 'Bob', socketId: 'sock_2' },
  { name: 'Cara', socketId: 'sock_3' },
];

export const mockChatMessages: ChatMessageBroadcast[] = [
  { name: 'Alice', text: 'hey, anyone around?', time: new Date().toISOString() },
  { name: 'Bob', text: 'yep, just joined', time: new Date().toISOString() },
];

/** Fake call token response — enough to build/test the Call UI without a real LiveKit project. */
export const mockCallTokenResponse: CallTokenResponse = {
  token: 'mock.jwt.token',
  livekitUrl: 'wss://mock-project.livekit.cloud',
  roomName: 'ch_demo123',
};

/**
 * Every Socket.IO event name used between apps/api and apps/web lives here.
 * Never hardcode an event name as a string literal in either app — import
 * SOCKET_EVENTS instead, so a typo becomes a compile error, not a silent
 * runtime mismatch between two people's code.
 */
export const SOCKET_EVENTS = {
  // client → server
  JOIN_CHANNEL: 'joinChannel',
  LEAVE_CHANNEL: 'leaveChannel',
  CHAT_MESSAGE: 'chatMessage',
  TYPING: 'typing',

  // server → client
  USER_JOINED: 'userJoined',
  USER_LEFT: 'userLeft',
  MEMBER_LIST: 'memberList',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

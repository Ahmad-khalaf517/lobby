import process from 'node:process';

import { dispose, Room, RoomEvent } from '@livekit/rtc-node';

let room = null;
let intentionalDisconnect = false;

async function shutdown() {
  intentionalDisconnect = true;
  const activeRoom = room;
  room = null;
  await activeRoom?.disconnect().catch(() => undefined);
  try {
    dispose();
  } catch {
    // The native SDK may already be disposed after a rejected connection.
  }
}

async function connect({ livekitUrl, token }) {
  room = new Room();
  room.on(RoomEvent.Disconnected, (reason) => {
    if (!intentionalDisconnect) {
      process.send?.({ type: 'unexpected-disconnect', reason: String(reason) });
    }
  });

  try {
    await room.connect(livekitUrl, token, { autoSubscribe: false, dynacast: true });
    const identity = room.localParticipant?.identity;
    if (!identity) throw new Error('Race contender connected without an identity.');
    process.send?.({ type: 'connected', identity });
  } catch (error) {
    await shutdown();
    process.send?.({
      type: 'rejected',
      error: error instanceof Error ? error.message : String(error),
    });
    process.disconnect();
  }
}

process.on('message', (message) => {
  if (typeof message !== 'object' || message === null) return;
  if (message.type === 'connect') {
    void connect(message);
  } else if (message.type === 'disconnect') {
    void shutdown().finally(() => {
      process.send?.({ type: 'closed' });
      process.disconnect();
    });
  }
});

process.on('disconnect', () => {
  void shutdown().finally(() => process.exit(0));
});

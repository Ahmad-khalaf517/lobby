import type { TrackPublication } from 'livekit-client';

export type CallConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

/** Generic audio-room participant used by guest and authenticated dashboards. */
export type CallParticipant = {
  id: string;
  memberId?: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMicMuted: boolean;
  isOwner?: boolean;
  inCall?: boolean;
  screenShareTrack: TrackPublication | null;
};

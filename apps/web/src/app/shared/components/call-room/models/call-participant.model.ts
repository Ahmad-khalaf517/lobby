import type { TrackPublication } from 'livekit-client';

/** Connection state of the LiveKit room, surfaced to the top-bar pill. */
export type CallConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

/**
 * A participant in a call (or, for the guest-room reuse, a channel member).
 * Presentational components consume this shape; the live data comes from the
 * real LiveKit Room via LivekitCallService (or is mapped from socket presence
 * for the guest-room reuse). `cameraTrack`/`screenShareTrack` are the raw
 * LiveKit publications so <video> elements can call `track.attach()`.
 */
export type CallParticipant = {
  /** Stable id (LiveKit identity for call participants, socketId for guests). */
  id: string;
  /** Display name. */
  name: string;
  /** Whether this is the local user ("You" tag + highlighted tile border). */
  isLocal: boolean;
  /** Whether the participant is currently speaking (LiveKit active speakers). */
  isSpeaking: boolean;
  /** Whether the participant's microphone is muted (no mic or mic disabled). */
  isMicMuted: boolean;
  /** Whether the participant's camera is off (no track or muted track). */
  isCameraOff: boolean;
  /** LiveKit camera publication to attach to a <video> — null when off. */
  cameraTrack: TrackPublication | null;
  /** LiveKit screen-share publication — null when nobody is sharing. */
  screenShareTrack: TrackPublication | null;
};

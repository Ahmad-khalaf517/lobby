import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  ConnectionState,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type TrackPublication,
} from 'livekit-client';

import type { CallConnectionState, CallParticipant } from '../models/call-participant.model';

export type LiveKitConnectionDetails = {
  livekitUrl: string;
  token: string;
  roomName: string;
};

@Injectable({ providedIn: 'root' })
export class LiveKitCallService {
  private readonly platformId = inject(PLATFORM_ID);
  private room: Room | null = null;
  private readonly audioElements = new Map<string, HTMLAudioElement>();

  private readonly _roomName = signal('Live room');
  private readonly _connectionState = signal<CallConnectionState>('idle');
  private readonly _participants = signal<CallParticipant[]>([]);
  private readonly _micPending = signal(false);
  private readonly _screenSharePending = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly roomName = this._roomName.asReadonly();
  readonly connectionState = this._connectionState.asReadonly();
  readonly participants = this._participants.asReadonly();
  readonly micPending = this._micPending.asReadonly();
  readonly screenSharePending = this._screenSharePending.asReadonly();
  readonly error = this._error.asReadonly();

  readonly joined = computed(() => this._connectionState() !== 'idle');
  readonly connected = computed(() => this._connectionState() === 'connected');
  readonly localParticipant = computed(
    () => this._participants().find((participant) => participant.isLocal) ?? null,
  );
  readonly micEnabled = computed(() => this.localParticipant()?.isMicMuted === false);
  readonly screenShareActive = computed(
    () => this.localParticipant()?.screenShareTrack !== null && this.localParticipant() !== null,
  );
  readonly activeScreenShare = computed<{
    track: TrackPublication | null;
    sharerName: string;
    isLocal: boolean;
  }>(() => {
    const sharer = this._participants().find(
      (participant) => participant.screenShareTrack !== null,
    );
    return {
      track: sharer?.screenShareTrack ?? null,
      sharerName: sharer?.name ?? '',
      isLocal: sharer?.isLocal ?? false,
    };
  });
  readonly anotherParticipantSharing = computed(() => {
    const activeShare = this.activeScreenShare();
    return activeShare.track !== null && !activeShare.isLocal;
  });
  readonly screenShareDisabledReason = computed(() => {
    if (!this.connected()) {
      return 'Join the call before sharing your screen.';
    }
    if (this.anotherParticipantSharing()) {
      return `${this.activeScreenShare().sharerName || 'Another participant'} is already sharing.`;
    }
    return null;
  });

  async connect(details: LiveKitConnectionDetails): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.disconnect();
    this._error.set(null);
    this._roomName.set(details.roomName);
    this._connectionState.set('connecting');

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
    });
    this.room = room;
    this.attachRoomListeners(room);

    try {
      await room.connect(details.livekitUrl, details.token);
      this.refreshParticipants();

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        this._error.set('Microphone access was blocked. You can still listen to the call.');
      }

      this.refreshParticipants();
    } catch (error: unknown) {
      this.disconnect();
      const message = describeLiveKitError(error);
      this._error.set(message);
      throw new Error(message);
    }
  }

  async toggleMic(): Promise<void> {
    if (!this.room || !this.connected()) return;

    this._micPending.set(true);
    this._error.set(null);
    try {
      await this.room.localParticipant.setMicrophoneEnabled(!this.micEnabled());
      this.refreshParticipants();
    } catch {
      this._error.set('Could not change your microphone. Check browser permissions.');
    } finally {
      this._micPending.set(false);
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.room || !this.connected()) return;

    if (!this.screenShareActive() && this.anotherParticipantSharing()) {
      this._error.set(this.screenShareDisabledReason());
      return;
    }

    this._screenSharePending.set(true);
    this._error.set(null);
    try {
      await this.room.localParticipant.setScreenShareEnabled(!this.screenShareActive());
      this.refreshParticipants();
    } catch {
      this._error.set('Screen sharing could not start. Check your browser permissions.');
    } finally {
      this._screenSharePending.set(false);
    }
  }

  dismissError(): void {
    this._error.set(null);
  }

  disconnect(): void {
    const room = this.room;
    this.room = null;

    if (room) {
      try {
        room.localParticipant.trackPublications.forEach((publication) => {
          if (publication.track) {
            room.localParticipant.unpublishTrack(publication.track, true);
          }
        });
      } catch {
        // Best-effort cleanup while leaving the call.
      }
      room.disconnect();
    }

    for (const element of this.audioElements.values()) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    this.audioElements.clear();

    this._participants.set([]);
    this._connectionState.set('idle');
    this._micPending.set(false);
    this._screenSharePending.set(false);
  }

  private attachRoomListeners(room: Room): void {
    room
      .on(RoomEvent.ConnectionStateChanged, this.onConnectionStateChanged)
      .on(RoomEvent.ParticipantConnected, this.refreshParticipants)
      .on(RoomEvent.ParticipantDisconnected, this.refreshParticipants)
      .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, this.refreshParticipants)
      .on(RoomEvent.TrackUnmuted, this.refreshParticipants)
      .on(RoomEvent.LocalTrackPublished, this.refreshParticipants)
      .on(RoomEvent.LocalTrackUnpublished, this.refreshParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, this.refreshParticipants);
  }

  private readonly onTrackSubscribed = (
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ): void => {
    const audioKey = `${participant.identity}:${publication.trackSid}`;
    if (track.kind === Track.Kind.Audio && !this.audioElements.has(audioKey)) {
      const element = track.attach();
      if (element instanceof HTMLAudioElement) {
        element.setAttribute('aria-hidden', 'true');
        this.audioElements.set(audioKey, element);
        void element.play().catch(() => {
          this._error.set('Your browser blocked remote audio. Click the page, then try again.');
        });
      }
    }
    this.refreshParticipants();
  };

  private readonly onTrackUnsubscribed = (
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ): void => {
    const audioKey = `${participant.identity}:${publication.trackSid}`;
    const element = this.audioElements.get(audioKey);
    if (element) {
      element.pause();
      element.srcObject = null;
      element.remove();
      this.audioElements.delete(audioKey);
    }
    track.detach();
    this.refreshParticipants();
  };

  private readonly onConnectionStateChanged = (state: ConnectionState): void => {
    switch (state) {
      case ConnectionState.Connected:
        this._connectionState.set('connected');
        break;
      case ConnectionState.Reconnecting:
        this._connectionState.set('reconnecting');
        break;
      case ConnectionState.Disconnected:
        this._connectionState.set('disconnected');
        break;
      case ConnectionState.Connecting:
        this._connectionState.set('connecting');
        break;
    }
  };

  private readonly refreshParticipants = (): void => {
    const room = this.room;
    if (!room) {
      this._participants.set([]);
      return;
    }

    const participants: CallParticipant[] = [];
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      const micPublication = participant.getTrackPublication(Track.Source.Microphone);
      const screenSharePublication = participant.getTrackPublication(Track.Source.ScreenShare);

      participants.push({
        id: participant.identity,
        name: participant.name || participant.identity,
        isLocal: participant === room.localParticipant,
        isSpeaking: participant.isSpeaking,
        isMicMuted: !micPublication || micPublication.isMuted || !micPublication.isEnabled,
        inCall: true,
        screenShareTrack:
          screenSharePublication &&
          !screenSharePublication.isMuted &&
          screenSharePublication.videoTrack
            ? screenSharePublication
            : null,
      });
    }

    participants.sort((left, right) =>
      left.isLocal ? -1 : right.isLocal ? 1 : left.name.localeCompare(right.name),
    );
    this._participants.set(participants);
  };
}

function describeLiveKitError(error: unknown): string {
  if (error instanceof Error) {
    if (/fetch|network|failed|ECONN|Unable to connect/i.test(error.message)) {
      return 'Could not reach the call server. Check your connection and try again.';
    }
    return error.message;
  }
  return 'Could not start the call. Please try again.';
}

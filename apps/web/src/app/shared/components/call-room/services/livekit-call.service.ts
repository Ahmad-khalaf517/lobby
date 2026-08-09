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
import { SessionScopeService } from '../../../../core/session-scope.service';

export type LiveKitConnectionDetails = {
  livekitUrl: string;
  token: string;
  roomName: string;
};

type AttachedRoomListeners = {
  connectionStateChanged: (state: ConnectionState) => void;
  participantsChanged: () => void;
  trackSubscribed: (
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ) => void;
  trackUnsubscribed: (
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ) => void;
};

@Injectable({ providedIn: 'root' })
export class LiveKitCallService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly sessionScope = inject(SessionScopeService);
  private room: Room | null = null;
  private readonly roomListeners = new WeakMap<Room, AttachedRoomListeners>();
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
  readonly screenShareSupported = computed(
    () =>
      isPlatformBrowser(this.platformId) &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getDisplayMedia === 'function',
  );

  readonly joined = computed(() => {
    const state = this._connectionState();
    return state === 'connecting' || state === 'connected' || state === 'reconnecting';
  });
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
    if (!this.screenShareSupported()) {
      return 'Screen sharing is not supported by this browser or device.';
    }
    if (!this.connected()) {
      return 'Join the call before sharing your screen.';
    }
    if (this.anotherParticipantSharing()) {
      return `${this.activeScreenShare().sharerName || 'Another participant'} is already sharing.`;
    }
    return null;
  });

  constructor() {
    this.sessionScope.registerCleanup(() => this.disconnect());
  }

  async connect(details: LiveKitConnectionDetails): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    await this.disconnect();
    this._error.set(null);
    this._roomName.set(details.roomName);
    this._connectionState.set('connecting');

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
    });
    this.room = room;
    this.attachRoomListeners(room);

    try {
      await room.connect(details.livekitUrl, details.token);

      if (this.room !== room) {
        await Promise.resolve(room.disconnect());
        return;
      }

      this._connectionState.set('connected');
      this.refreshParticipants(room);

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        this._error.set('Microphone access was blocked. You can still listen to the call.');
      }

      this.refreshParticipants(room);
    } catch (error: unknown) {
      if (this.room === room) {
        await this.disconnect();
        this._connectionState.set('error');
      } else {
        this.detachRoomListeners(room);
        await Promise.resolve(room.disconnect()).catch(() => undefined);
      }

      const message = describeLiveKitError(error);
      this._error.set(message);
      throw new Error(message);
    }
  }

  async toggleMic(): Promise<void> {
    const room = this.room;
    if (!room || !this.connected()) return;

    this._micPending.set(true);
    this._error.set(null);
    try {
      await room.localParticipant.setMicrophoneEnabled(!this.micEnabled());
      this.refreshParticipants(room);
    } catch {
      this._error.set('Could not change your microphone. Check browser permissions.');
    } finally {
      this._micPending.set(false);
    }
  }

  async toggleScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || !this.connected() || !this.screenShareSupported()) return;

    if (!this.screenShareActive() && this.anotherParticipantSharing()) {
      this._error.set(this.screenShareDisabledReason());
      return;
    }

    this._screenSharePending.set(true);
    this._error.set(null);
    try {
      await room.localParticipant.setScreenShareEnabled(!this.screenShareActive());
      this.refreshParticipants(room);
    } catch {
      this._error.set('Screen sharing could not start. Check your browser permissions.');
    } finally {
      this._screenSharePending.set(false);
    }
  }

  dismissError(): void {
    this._error.set(null);
  }

  async disconnect(): Promise<void> {
    const room = this.room;

    // Detach this instance immediately so late events from the old room cannot
    // put the UI back into a joined state while disconnect() is still settling.
    this.room = null;
    this._connectionState.set('idle');
    this._participants.set([]);
    this._micPending.set(false);
    this._screenSharePending.set(false);
    this.cleanupAudioElements();

    if (!room) return;

    this.detachRoomListeners(room);

    try {
      const unpublishTasks = [...room.localParticipant.trackPublications.values()]
        .filter((publication) => publication.track !== undefined)
        .map((publication) => room.localParticipant.unpublishTrack(publication.track!, true));

      await Promise.allSettled(unpublishTasks);
    } catch {
      // Best-effort media cleanup while leaving the call.
    }

    try {
      await Promise.resolve(room.disconnect());
    } catch {
      // The local state is already reset; a transport cleanup failure should
      // not force the user to click Leave again.
    }
  }

  private attachRoomListeners(room: Room): void {
    const listeners: AttachedRoomListeners = {
      connectionStateChanged: (state) => this.handleConnectionStateChanged(room, state),
      participantsChanged: () => this.refreshParticipants(room),
      trackSubscribed: (track, publication, participant) =>
        this.handleTrackSubscribed(room, track, publication, participant),
      trackUnsubscribed: (track, publication, participant) =>
        this.handleTrackUnsubscribed(room, track, publication, participant),
    };

    this.roomListeners.set(room, listeners);

    room
      .on(RoomEvent.ConnectionStateChanged, listeners.connectionStateChanged)
      .on(RoomEvent.ParticipantConnected, listeners.participantsChanged)
      .on(RoomEvent.ParticipantDisconnected, listeners.participantsChanged)
      .on(RoomEvent.TrackSubscribed, listeners.trackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, listeners.trackUnsubscribed)
      .on(RoomEvent.TrackMuted, listeners.participantsChanged)
      .on(RoomEvent.TrackUnmuted, listeners.participantsChanged)
      .on(RoomEvent.LocalTrackPublished, listeners.participantsChanged)
      .on(RoomEvent.LocalTrackUnpublished, listeners.participantsChanged)
      .on(RoomEvent.ActiveSpeakersChanged, listeners.participantsChanged);
  }

  private detachRoomListeners(room: Room): void {
    const listeners = this.roomListeners.get(room);
    if (!listeners) return;

    room
      .off(RoomEvent.ConnectionStateChanged, listeners.connectionStateChanged)
      .off(RoomEvent.ParticipantConnected, listeners.participantsChanged)
      .off(RoomEvent.ParticipantDisconnected, listeners.participantsChanged)
      .off(RoomEvent.TrackSubscribed, listeners.trackSubscribed)
      .off(RoomEvent.TrackUnsubscribed, listeners.trackUnsubscribed)
      .off(RoomEvent.TrackMuted, listeners.participantsChanged)
      .off(RoomEvent.TrackUnmuted, listeners.participantsChanged)
      .off(RoomEvent.LocalTrackPublished, listeners.participantsChanged)
      .off(RoomEvent.LocalTrackUnpublished, listeners.participantsChanged)
      .off(RoomEvent.ActiveSpeakersChanged, listeners.participantsChanged);

    this.roomListeners.delete(room);
  }

  private handleTrackSubscribed(
    room: Room,
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ): void {
    if (this.room !== room) {
      track.detach();
      return;
    }

    const audioKey = `${participant.identity}:${publication.trackSid}`;
    if (track.kind === Track.Kind.Audio && !this.audioElements.has(audioKey)) {
      const element = track.attach();
      if (element instanceof HTMLAudioElement) {
        element.setAttribute('aria-hidden', 'true');
        this.audioElements.set(audioKey, element);
        void element.play().catch(() => {
          if (this.room === room) {
            this._error.set('Your browser blocked remote audio. Click the page, then try again.');
          }
        });
      }
    }

    this.refreshParticipants(room);
  }

  private handleTrackUnsubscribed(
    room: Room,
    track: Track,
    publication: TrackPublication,
    participant: RemoteParticipant,
  ): void {
    const audioKey = `${participant.identity}:${publication.trackSid}`;
    const element = this.audioElements.get(audioKey);
    if (element) {
      element.pause();
      element.srcObject = null;
      element.remove();
      this.audioElements.delete(audioKey);
    }

    track.detach();
    this.refreshParticipants(room);
  }

  private handleConnectionStateChanged(room: Room, state: ConnectionState): void {
    if (this.room !== room) return;

    switch (state) {
      case ConnectionState.Connected:
        this._connectionState.set('connected');
        this.refreshParticipants(room);
        break;
      case ConnectionState.Reconnecting:
        this._connectionState.set('reconnecting');
        break;
      case ConnectionState.Disconnected:
        this.detachRoomListeners(room);
        this.room = null;
        this.cleanupAudioElements();
        this._participants.set([]);
        this._micPending.set(false);
        this._screenSharePending.set(false);
        this._connectionState.set('disconnected');
        break;
      case ConnectionState.Connecting:
        this._connectionState.set('connecting');
        break;
    }
  }

  private refreshParticipants(room: Room): void {
    if (this.room !== room) return;

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
  }

  private cleanupAudioElements(): void {
    for (const element of this.audioElements.values()) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    this.audioElements.clear();
  }
}

function describeLiveKitError(error: unknown): string {
  if (error instanceof Error) {
    if (
      /room.+full|max(?:imum)? participants|participant limit|resource exhausted|capacity exceeded/i.test(
        error.message,
      )
    ) {
      return 'The call just became full. You can stay in the room and join when a spot becomes available.';
    }
    if (/fetch|network|failed|ECONN|Unable to connect/i.test(error.message)) {
      return 'Could not reach the call server. Check your connection and try again.';
    }
    return error.message;
  }
  return 'Could not start the call. Please try again.';
}

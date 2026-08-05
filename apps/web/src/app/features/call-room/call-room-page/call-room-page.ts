import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CallTokenRequestSchema, CallTokenResponseSchema, MAX_NAME_LENGTH } from '@lobby/shared';
import { ConnectionState, Room, RoomEvent, Track, type TrackPublication } from 'livekit-client';
import { environment } from '../../../../environments/environment';
import {
  CallControlBarComponent,
  CallParticipantsSidebarComponent,
  CallRoomCodeCardComponent,
  CallStageComponent,
  CallTopBarComponent,
  CallVideoTileComponent,
  type CallConnectionState,
  type CallParticipant,
} from '../../../shared/components/call-room';
import { CallIconComponent, RoomChatComponent } from '../../../shared/components/room-chat';
import { ChannelChatService } from '../../../shared/services/channel-chat.service';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

type CallPageStatus = 'needs-name' | 'loading' | 'ready' | 'error';

const GUEST_LINK_TOAST_MS = 1500;

/**
 * Call room page — a thin composer. It owns the real connections (REST token
 * fetch + LiveKit Room + the shared ChannelChatService for the room-chat
 * sidebar) and renders the presentational call components with that live
 * state. The shared call components do the actual UI; this page never contains
 * layout markup for them.
 */
@Component({
  selector: 'app-call-room-page',
  imports: [
    ReactiveFormsModule,
    LogoComponent,
    RoomChatComponent,
    CallIconComponent,
    CallTopBarComponent,
    CallParticipantsSidebarComponent,
    CallRoomCodeCardComponent,
    CallStageComponent,
    CallVideoTileComponent,
    CallControlBarComponent,
  ],
  templateUrl: './call-room-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallRoomPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly chat = inject(ChannelChatService);

  private readonly roomChat = viewChild(RoomChatComponent);

  protected readonly channelId = this.route.snapshot.paramMap.get('inviteCode') ?? '';
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly status = signal<CallPageStatus>('needs-name');
  protected readonly errorMessage = signal('');
  protected readonly actionError = signal<string | null>(null);
  protected readonly displayName = signal('');
  protected readonly roomName = signal('Live room');
  protected readonly connectionState = signal<CallConnectionState>('idle');
  protected readonly participants = signal<CallParticipant[]>([]);
  protected readonly micEnabled = signal(false);
  protected readonly micPending = signal(false);
  protected readonly cameraEnabled = signal(false);
  protected readonly screenShareActive = signal(false);
  protected readonly screenSharePending = signal(false);
  protected readonly inviteCopied = signal(false);
  protected readonly showParticipants = signal(false);

  protected readonly channelName = computed<string>(() => this.chat.channel()?.name ?? 'Room chat');

  /** The active screen-share publication (first sharer wins) for the stage. */
  protected readonly activeScreenShare = computed<{
    track: TrackPublication | null;
    sharerName: string;
    isLocal: boolean;
  }>(() => {
    const sharer = this.participants().find((participant) => participant.screenShareTrack);
    return {
      track: sharer?.screenShareTrack ?? null,
      sharerName: sharer?.name ?? '',
      isLocal: sharer?.isLocal ?? false,
    };
  });

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
  });

  private room: Room | null = null;
  private inviteCopiedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.channelId) {
      this.status.set('error');
      this.errorMessage.set('Missing channel id in the call link.');
      return;
    }

    const nameFromLink = this.route.snapshot.queryParamMap.get('name')?.trim();
    if (nameFromLink) {
      this.start(nameFromLink);
    }

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  protected submitName(): void {
    if (this.nameControl.invalid) {
      this.nameControl.markAsTouched();
      return;
    }
    this.start(this.nameControl.value.trim());
  }

  protected async toggleMic(): Promise<void> {
    if (!this.room) {
      return;
    }
    this.micPending.set(true);
    try {
      await this.room.localParticipant.setMicrophoneEnabled(!this.micEnabled());
    } catch {
      this.actionError.set('Could not toggle your microphone. Check browser permissions.');
    } finally {
      this.micPending.set(false);
    }
  }

  protected async toggleCamera(): Promise<void> {
    if (!this.room) {
      return;
    }
    try {
      await this.room.localParticipant.setCameraEnabled(!this.cameraEnabled());
    } catch {
      this.actionError.set('Cameras are not available in this room (audio-only session).');
    }
  }

  protected async toggleScreenShare(): Promise<void> {
    if (!this.room) {
      return;
    }
    this.screenSharePending.set(true);
    try {
      await this.room.localParticipant.setScreenShareEnabled(!this.screenShareActive());
    } catch {
      this.actionError.set('Screen sharing is not available in this room (audio-only session).');
    } finally {
      this.screenSharePending.set(false);
    }
  }

  protected dismissActionError(): void {
    this.actionError.set(null);
  }

  protected copyInvite(): void {
    const link = this.guestInviteLink();

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(link).then(() => {
      this.inviteCopied.set(true);

      if (this.inviteCopiedTimeoutId !== null) {
        clearTimeout(this.inviteCopiedTimeoutId);
      }
      this.inviteCopiedTimeoutId = setTimeout(
        () => this.inviteCopied.set(false),
        GUEST_LINK_TOAST_MS,
      );
    });
  }

  protected guestInviteLink(): string {
    if (typeof window === 'undefined') {
      return `/guest/${this.channelId}`;
    }
    return `${window.location.origin}/guest/${this.channelId}`;
  }

  protected leaveCall(): void {
    this.cleanup();
    void this.router.navigate(['/guest', this.channelId]);
  }

  protected onReact({ messageId, emoji }: { messageId: string; emoji: string }): void {
    this.chat.react(messageId, emoji);
  }

  protected async start(name: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.displayName.set(name);
    this.status.set('loading');
    this.actionError.set(null);

    try {
      await Promise.all([this.chat.join(this.channelId, name), this.connectLiveKit(name)]);
      this.status.set('ready');
      queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
    } catch (error: unknown) {
      this.cleanup();
      this.errorMessage.set(this.describeError(error));
      this.status.set('error');
    }
  }

  private async connectLiveKit(name: string): Promise<void> {
    this.connectionState.set('connecting');

    const response = await this.fetchCallToken(name);
    this.roomName.set(response.roomName);

    const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: false });
    this.room = room;
    this.attachRoomListeners(room);

    await room.connect(response.livekitUrl, response.token);
    this.refreshParticipants();

    // Best-effort mic publish — the call stays usable for listening if the
    // browser blocks the mic or the user hasn't granted permission yet.
    if (!this.micEnabled()) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        this.refreshParticipants();
      } catch {
        this.actionError.set('Could not turn on your microphone. Check browser permissions.');
      }
    }
  }

  private async fetchCallToken(name: string) {
    const body = CallTokenRequestSchema.parse({ name });
    const raw = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl()}/channels/${this.channelId}/call-token`, body),
    );
    return CallTokenResponseSchema.parse(raw);
  }

  private attachRoomListeners(room: Room): void {
    room
      .on(RoomEvent.ConnectionStateChanged, this.onConnectionStateChanged)
      .on(RoomEvent.ParticipantConnected, this.refreshParticipants)
      .on(RoomEvent.ParticipantDisconnected, this.refreshParticipants)
      .on(RoomEvent.TrackSubscribed, this.refreshParticipants)
      .on(RoomEvent.TrackUnsubscribed, this.refreshParticipants)
      .on(RoomEvent.TrackMuted, this.refreshParticipants)
      .on(RoomEvent.TrackUnmuted, this.refreshParticipants)
      .on(RoomEvent.LocalTrackPublished, this.refreshParticipants)
      .on(RoomEvent.LocalTrackUnpublished, this.refreshParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, this.refreshParticipants);
  }

  private readonly onConnectionStateChanged = (state: ConnectionState): void => {
    switch (state) {
      case ConnectionState.Connected:
        this.connectionState.set('connected');
        break;
      case ConnectionState.Reconnecting:
        this.connectionState.set('reconnecting');
        break;
      case ConnectionState.Disconnected:
        this.connectionState.set('disconnected');
        break;
      case ConnectionState.Connecting:
        this.connectionState.set('connecting');
        break;
    }
  };

  private refreshParticipants = (): void => {
    const room = this.room;
    if (!room) {
      this.participants.set([]);
      return;
    }

    const participants: CallParticipant[] = [];
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      const micPublication = participant.getTrackPublication(Track.Source.Microphone);
      const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
      const screenSharePublication = participant.getTrackPublication(Track.Source.ScreenShare);

      const cameraOff =
        !cameraPublication || cameraPublication.isMuted || !cameraPublication.isEnabled;

      participants.push({
        id: participant.identity,
        name: participant.name || participant.identity,
        isLocal: participant === room.localParticipant,
        isSpeaking: participant.isSpeaking,
        isMicMuted: !micPublication || micPublication.isMuted || !micPublication.isEnabled,
        isCameraOff: cameraOff,
        cameraTrack: cameraOff ? null : cameraPublication,
        screenShareTrack:
          screenSharePublication && !screenSharePublication.isMuted ? screenSharePublication : null,
      });
    }

    participants.sort((a, b) => (a.isLocal ? -1 : b.isLocal ? 1 : a.name.localeCompare(b.name)));

    this.participants.set(participants);
    this.micEnabled.set(
      participants.find((participant) => participant.isLocal)?.isMicMuted === false,
    );
    this.cameraEnabled.set(
      participants.find((participant) => participant.isLocal)?.isCameraOff === false,
    );
    this.screenShareActive.set(
      participants.find((participant) => participant.isLocal)?.screenShareTrack != null,
    );
  };

  private cleanup(): void {
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
        // Unpublishing is best-effort on leave.
      }
      room.disconnect();
    }

    this.chat.leave();
    this.participants.set([]);
    this.connectionState.set('idle');
    this.micEnabled.set(false);
    this.cameraEnabled.set(false);
    this.screenShareActive.set(false);
    this.micPending.set(false);
    this.screenSharePending.set(false);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message;
      if (/fetch|network|failed|ECONN|Unable to connect/i.test(message)) {
        return 'Could not reach the call server. Check your connection and try again.';
      }
      return `Could not start the call: ${message}`;
    }
    return 'Could not start the call. Please try again.';
  }

  private apiUrl(): string {
    return environment.apiUrl.replace(/\/$/, '');
  }
}

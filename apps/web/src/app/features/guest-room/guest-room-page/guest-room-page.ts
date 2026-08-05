import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CallStatusResponseSchema, MAX_NAME_LENGTH } from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import {
  CallIconComponent,
  RoomChatComponent,
  initialsFromName,
  type ChatMessage,
  type SendChatMessage,
} from '../../../shared/components/room-chat';
import {
  CallParticipantsSidebarComponent,
  CallRoomCodeCardComponent,
  type CallParticipant,
} from '../../../shared/components/call-room';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';
import { GuestChannelStore } from '../services/guest-channel.store';

type RoomStatus = 'needs-name' | 'loading' | 'ready' | 'not-found' | 'error';
type MessageToast = { id: number; name: string; text: string };
const CALL_STATUS_POLL_MS = 10_000;

@Component({
  selector: 'app-guest-room-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LogoComponent,
    RoomChatComponent,
    CallIconComponent,
    CallParticipantsSidebarComponent,
    CallRoomCodeCardComponent,
  ],
  templateUrl: './guest-room-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestRoomPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly guest = inject(GuestChannelStore);
  private readonly roomChat = viewChild(RoomChatComponent);

  protected readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly status = signal<RoomStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly channel = this.guest.channel;
  protected readonly chatMessages = this.guest.chatMessages;
  protected readonly connected = this.guest.connected;
  protected readonly displayName = this.guest.displayName;
  protected readonly currentUser = this.guest.currentUser;
  protected readonly memberNames = this.guest.memberNames;
  protected readonly toasts = signal<MessageToast[]>([]);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly callActive = signal(false);
  protected readonly joinCallDismissed = signal(false);
  protected readonly initials = initialsFromName;
  protected readonly isOwner = this.guest.isOwner;

  protected readonly memberParticipants = computed<CallParticipant[]>(() =>
    this.guest.members().map((member) => ({
      id: member.livekit_identity,
      name: member.display_name,
      isLocal: member.id === this.guest.currentMember()?.id,
      isSpeaking: false,
      isMicMuted: true,
      isCameraOff: true,
      cameraTrack: null,
      screenShareTrack: null,
    })),
  );

  protected readonly joinCallBannerVisible = computed(
    () => this.callActive() && !this.joinCallDismissed(),
  );

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
  });

  private audioContext: AudioContext | null = null;
  private callStatusIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!this.inviteCode) {
      this.status.set('not-found');
    } else {
      const requestedName = this.route.snapshot.queryParamMap.get('name')?.trim();
      if (requestedName) void this.enterRoom(requestedName);
      else void this.restoreRoom();
    }

    this.destroyRef.onDestroy(() => {
      if (this.callStatusIntervalId) clearInterval(this.callStatusIntervalId);
      void this.audioContext?.close();
      void this.guest.cleanup();
    });

    effect(() => {
      const storeError = this.guest.error();
      if (storeError) this.errorMessage.set(storeError);
      if (this.guest.ended() && this.status() === 'ready') {
        this.errorMessage.set('This guest channel has ended or expired.');
        this.status.set('error');
      }
    });
  }

  protected submitName(): void {
    if (this.nameControl.invalid) {
      this.nameControl.markAsTouched();
      return;
    }
    void this.enterRoom(this.nameControl.value.trim());
  }

  protected onSendMessage(message: SendChatMessage): void {
    const shouldStickToBottom = this.roomChat()?.isNearBottom() ?? true;
    void this.guest
      .send(message)
      .then(() => {
        if (shouldStickToBottom) queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
      })
      .catch((error: unknown) => this.showActionError(error));
  }

  protected onReact({ messageId, emoji }: { messageId: string; emoji: string }): void {
    void this.guest
      .toggleReaction(messageId, emoji)
      .catch((error: unknown) => this.showActionError(error));
  }

  protected onDelete(messageId: string): void {
    void this.guest.deleteMessage(messageId).catch((error: unknown) => this.showActionError(error));
  }

  protected onEdit(message: ChatMessage): void {
    if (typeof window === 'undefined') return;
    const content = window.prompt('Edit message', message.text)?.trim();
    if (!content || content === message.text) return;
    void this.guest
      .editMessage(message.id, content)
      .catch((error: unknown) => this.showActionError(error));
  }

  protected onCloseChat(): void {
    void this.leaveChannel();
  }

  protected async leaveChannel(): Promise<void> {
    try {
      await this.guest.leave();
      await this.router.navigate(['/guests']);
    } catch (error: unknown) {
      this.showActionError(error);
    }
  }

  protected async closeChannel(): Promise<void> {
    try {
      await this.guest.close();
    } catch (error: unknown) {
      this.showActionError(error);
    }
  }

  protected toggleSidebar(): void {
    this.playClickSound();
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  protected guestInviteLink(): string {
    const path = `/guest/${this.inviteCode}`;
    return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  }

  protected goToCall(): void {
    void this.router.navigate(['/guest', this.inviteCode, 'call']);
  }

  protected dismissJoinCall(): void {
    this.joinCallDismissed.set(true);
  }

  protected dismissToast(id: number): void {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }

  protected goToGuests(): void {
    void this.leaveChannel();
  }

  private async restoreRoom(): Promise<void> {
    try {
      const result = await this.guest.restore(this.inviteCode);
      if (result === 'needs-name') {
        this.status.set('needs-name');
        return;
      }
      this.roomReady();
    } catch (error: unknown) {
      this.handleEntryError(error);
    }
  }

  private async enterRoom(name: string): Promise<void> {
    this.status.set('loading');
    try {
      await this.guest.join(this.inviteCode, name);
      this.roomReady();
    } catch (error: unknown) {
      this.handleEntryError(error);
    }
  }

  private roomReady(): void {
    this.status.set('ready');
    queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
    this.startCallStatusPolling();
  }

  private startCallStatusPolling(): void {
    const poll = async (): Promise<void> => {
      const channelId = this.guest.channel()?.id;
      if (!channelId) return;
      try {
        const raw = await firstValueFrom(
          this.http.get<unknown>(`${environment.apiUrl}/channels/${channelId}/call-status`),
        );
        this.callActive.set(CallStatusResponseSchema.parse(raw).active);
      } catch {
        this.callActive.set(false);
      }
    };
    void poll();
    this.callStatusIntervalId = setInterval(() => void poll(), CALL_STATUS_POLL_MS);
  }

  private handleEntryError(error: unknown): void {
    const message = describeError(error);
    this.errorMessage.set(message);
    this.status.set(/not found|invalid invite/i.test(message) ? 'not-found' : 'error');
  }

  private showActionError(error: unknown): void {
    this.errorMessage.set(describeError(error));
  }

  private playClickSound(): void {
    if (typeof AudioContext === 'undefined') return;
    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    gain.gain.value = 0.04;
    oscillator.frequency.value = 1500;
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.04);
  }
}

function describeError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'The guest room request failed.';
}

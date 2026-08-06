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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationStart, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { guestDisplayNameSchema } from '../../../shared/validation/guest-channel.schema';
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

  protected readonly nameSubmitted = signal(false);
  protected readonly nameControl = new FormControl('', { nonNullable: true });

  private audioContext: AudioContext | null = null;
  private callStatusIntervalId: ReturnType<typeof setInterval> | null = null;
  private preserveGuestStateOnDestroy = false;

  constructor() {
    if (!this.inviteCode) {
      this.status.set('not-found');
    } else {
      const requestedName = this.route.snapshot.queryParamMap.get('name')?.trim();
      if (requestedName) {
        this.nameControl.setValue(requestedName);
        const parsedName = this.parseDisplayName();
        if (parsedName) {
          void this.enterRoom(parsedName);
        } else {
          this.nameSubmitted.set(true);
          this.status.set('needs-name');
        }
      } else {
        void this.restoreRoom();
      }
    }

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof NavigationStart)) {
        return;
      }

      const targetPath = event.url.split(/[?#]/, 1)[0]?.replace(/\/$/, '') ?? '';
      this.preserveGuestStateOnDestroy =
        targetPath === `/guest/${this.inviteCode}` ||
        targetPath === `/guest/${this.inviteCode}/call`;
    });

    this.destroyRef.onDestroy(() => {
      if (this.callStatusIntervalId) clearInterval(this.callStatusIntervalId);
      void this.audioContext?.close();
      if (!this.preserveGuestStateOnDestroy) {
        void this.guest.cleanup();
      }
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

  protected nameFieldError(): string | null {
    const error = this.nameControl.errors?.['zod'];
    const shouldShow = this.nameControl.touched || this.nameControl.dirty || this.nameSubmitted();
    return shouldShow && typeof error === 'string' ? error : null;
  }

  protected validateNameField(): void {
    this.parseDisplayName();
  }

  protected handleNameInput(): void {
    this.errorMessage.set('');
    this.parseDisplayName();
  }

  protected submitName(): void {
    this.nameSubmitted.set(true);
    const name = this.parseDisplayName();
    if (name === null) {
      this.nameControl.markAsTouched();
      return;
    }
    void this.enterRoom(name);
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

  protected async goToCall(): Promise<void> {
    this.preserveGuestStateOnDestroy = true;
    try {
      const navigated = await this.router.navigate(['/guest', this.inviteCode, 'call']);
      if (!navigated) {
        this.preserveGuestStateOnDestroy = false;
      }
    } catch (error: unknown) {
      this.preserveGuestStateOnDestroy = false;
      this.showActionError(error);
    }
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

  private parseDisplayName(): string | null {
    this.nameControl.setErrors(null);
    const result = guestDisplayNameSchema.safeParse(this.nameControl.value);
    if (result.success) {
      return result.data;
    }

    this.nameControl.setErrors({
      zod: result.error.issues[0]?.message ?? 'Enter a valid display name.',
    });
    return null;
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
    if (this.callStatusIntervalId) {
      clearInterval(this.callStatusIntervalId);
    }

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

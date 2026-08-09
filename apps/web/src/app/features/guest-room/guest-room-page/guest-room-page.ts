import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  CallParticipantRemovalRequestSchema,
  CallParticipantRemovalResponseSchema,
  CallStatusResponseSchema,
  CallTokenRequestSchema,
  CallTokenResponseSchema,
  DEFAULT_CALL_PARTICIPANTS,
  MAX_NAME_LENGTH,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import {
  CallControlBarComponent,
  CallParticipantsSidebarComponent,
  CallStageComponent,
  LiveKitCallService,
  VoiceParticipantTileComponent,
  type CallParticipant,
} from '../../../shared/components/call-room';
import {
  RoomChatComponent,
  type ChatMessage,
  type SendChatMessage,
} from '../../../shared/components/room-chat';
import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';
import { guestDisplayNameSchema } from '../../../shared/validation/guest-channel.schema';
import { AuthService } from '../../auth/services/auth';
import { GuestChannelStore } from '../services/guest-channel.store';
import { ShareRoomDialogComponent } from '../share-room-dialog/share-room-dialog.component';

type RoomStatus = 'needs-name' | 'loading' | 'ready' | 'not-found' | 'error';
type ConfirmationKind = 'leave' | 'close' | 'kick' | 'block';
type ModerationConfirmation = {
  kind: 'kick' | 'block';
  participant: CallParticipant;
};
type RoomConfirmation = { kind: 'leave' | 'close'; participant?: never } | ModerationConfirmation;
const CALL_STATUS_POLL_MS = 3_000;
const CALL_SESSION_KEY_PREFIX = 'lobby:guest-call:';
const MAX_MODERATION_REASON_LENGTH = 240;

@Component({
  selector: 'app-guest-room-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LogoComponent,
    LobbyIconComponent,
    RoomChatComponent,
    CallParticipantsSidebarComponent,
    CallStageComponent,
    VoiceParticipantTileComponent,
    CallControlBarComponent,
    ShareRoomDialogComponent,
  ],

  templateUrl: './guest-room-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestRoomPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  protected readonly guest = inject(GuestChannelStore);
  protected readonly call = inject(LiveKitCallService);
  private readonly roomChat = viewChild(RoomChatComponent);

  protected readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxModerationReasonLength = MAX_MODERATION_REASON_LENGTH;
  protected readonly status = signal<RoomStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly actionNotice = signal<string | null>(null);
  protected readonly callActive = signal(false);
  protected readonly callStatusLoading = signal(true);
  protected readonly callStatusParticipantCount = signal(0);
  protected readonly callJoining = signal(false);
  protected readonly restoringCallSession = signal(false);
  protected readonly mobileChatOpen = signal(false);
  protected readonly membersPanelOpen = signal(false);
  protected readonly chatCollapsed = signal(false);
  protected readonly shareRoomOpen = signal(false);
  protected readonly now = signal(Date.now());
  protected readonly confirmation = signal<RoomConfirmation | null>(null);
  protected readonly confirmationPending = signal(false);
  private readonly desktopLayout = signal(false);

  protected readonly channel = this.guest.channel;
  protected readonly chatMessages = this.guest.chatMessages;
  protected readonly connected = this.guest.connected;
  protected readonly displayName = this.guest.displayName;
  protected readonly currentUser = this.guest.currentUser;
  protected readonly memberNames = this.guest.memberNames;
  protected readonly isOwner = this.guest.isOwner;

  protected readonly nameSubmitted = signal(false);
  protected readonly nameControl = new FormControl('', { nonNullable: true });
  protected readonly moderationReasonControl = new FormControl('', { nonNullable: true });

  protected readonly roomParticipants = computed<CallParticipant[]>(() => {
    const liveByIdentity = new Map(
      this.call.participants().map((participant) => [participant.id, participant] as const),
    );
    const ownerMemberId = this.guest.channel()?.owner_member_id;
    const currentMemberId = this.guest.currentMember()?.id;

    return this.guest.members().map((member) => {
      const live = liveByIdentity.get(member.livekit_identity);
      return {
        id: member.livekit_identity,
        memberId: member.id,
        name: member.display_name,
        isLocal: member.id === currentMemberId,
        isOwner: member.id === ownerMemberId,
        isSpeaking: live?.isSpeaking ?? false,
        isMicMuted: live?.isMicMuted ?? true,
        inCall: live !== undefined,
        screenShareTrack: live?.screenShareTrack ?? null,
      };
    });
  });

  protected readonly callParticipants = computed<CallParticipant[]>(() => {
    const membersByIdentity = new Map(
      this.guest.members().map((member) => [member.livekit_identity, member] as const),
    );

    return this.call.participants().map((participant) => {
      const member = membersByIdentity.get(participant.id);
      return {
        ...participant,
        memberId: member?.id,
        isOwner: member?.id === this.guest.channel()?.owner_member_id,
      };
    });
  });

  protected readonly roomMemberCount = computed(() => this.guest.members().length);
  protected readonly callParticipantCount = computed(() =>
    this.call.joined() ? this.call.participants().length : this.callStatusParticipantCount(),
  );
  protected readonly callCapacity = computed(
    () => this.channel()?.max_call_participants ?? DEFAULT_CALL_PARTICIPANTS,
  );
  protected readonly callFull = computed(() => this.callParticipantCount() >= this.callCapacity());
  protected readonly chatOpen = computed(() =>
    this.desktopLayout() ? !this.chatCollapsed() : this.mobileChatOpen(),
  );
  protected readonly expiresInLabel = computed(() => {
    const expiresAt = this.channel()?.expires_at;
    if (!expiresAt) return 'Temporary room';
    const remainingMs = Date.parse(expiresAt) - this.now();
    if (remainingMs <= 0) return 'Expired';
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    if (minutes < 60) return `${minutes} min remaining`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest > 0 ? `${hours}h ${rest}m remaining` : `${hours}h remaining`;
  });

  private callStatusIntervalId: ReturnType<typeof setInterval> | null = null;
  private callStatusPollInFlight = false;
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly openShareAfterCreation =
    this.router.getCurrentNavigation()?.extras.state?.['shareRoom'] === true;
  private pendingNavigationResolution: ((allow: boolean) => void) | null = null;
  private allowNavigation = false;
  private destroyed = false;

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

    this.clockIntervalId = setInterval(() => this.now.set(Date.now()), 60_000);

    if (typeof window !== 'undefined') {
      const desktopQuery = window.matchMedia('(min-width: 1024px)');
      const updateDesktopLayout = (event: MediaQueryListEvent | MediaQueryList): void => {
        this.desktopLayout.set(event.matches);
      };
      updateDesktopLayout(desktopQuery);
      desktopQuery.addEventListener('change', updateDesktopLayout);
      this.destroyRef.onDestroy(() =>
        desktopQuery.removeEventListener('change', updateDesktopLayout),
      );
    }

    effect(() => {
      const storeError = this.guest.error();
      if (storeError) this.actionNotice.set(storeError);

      if (this.guest.ended() && this.status() === 'ready') {
        this.forgetCallSession();
        void this.call.disconnect();
        this.errorMessage.set('This guest room has ended or expired.');
        this.status.set('error');
      }

      const member = this.guest.currentMember();
      if (this.status() === 'ready' && member && (member.left_at || member.removed_at)) {
        this.forgetCallSession();
        void this.call.disconnect();
        const reason = member.removed_reason?.trim();
        const removalMessage =
          member.removed_kind === 'blocked'
            ? 'You have been blocked from this room.'
            : 'You were removed from this room.';
        this.errorMessage.set(
          member.removed_at
            ? `${removalMessage}${reason ? ` Reason: ${reason}` : ''}`
            : 'You have left this room.',
        );
        this.status.set('error');
      }
    });

    effect(() => {
      const callError = this.call.error();
      if (callError) this.actionNotice.set(callError);
    });

    effect(() => {
      const authStatus = this.auth.status();
      if (authStatus === 'unauthenticated' || authStatus === 'error') {
        this.stopCallStatusPolling();
      }
    });

    effect(() => {
      const connectionState = this.call.connectionState();
      if (
        this.status() === 'ready' &&
        (connectionState === 'disconnected' || connectionState === 'error')
      ) {
        void this.refreshCallStatus();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stopCallStatusPolling();
      if (this.clockIntervalId) clearInterval(this.clockIntervalId);
      this.pendingNavigationResolution?.(false);
      this.pendingNavigationResolution = null;
      void this.call.disconnect();
      void this.guest.cleanup();
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.mobileChatOpen.set(false);
      this.membersPanelOpen.set(false);
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

  protected async joinCall(restoringSession = false): Promise<void> {
    if (this.callJoining() || this.call.joined() || this.destroyed) return;
    if (this.callFull() && !restoringSession) {
      this.actionNotice.set(this.callFullMessage(false));
      return;
    }

    this.callJoining.set(true);
    this.restoringCallSession.set(restoringSession);
    this.actionNotice.set(null);

    try {
      const channelId = this.guest.channel()?.id;
      if (!channelId) throw new Error('Active channel membership is required.');

      const body = CallTokenRequestSchema.parse({ channelId });
      const raw = await firstValueFrom(
        this.http.post<unknown>(`${this.apiUrl()}/livekit/token`, body),
      );
      const response = CallTokenResponseSchema.parse(raw);

      // The component may have been destroyed while the token request was in flight.
      if (this.destroyed) return;

      await this.call.connect({
        livekitUrl: response.livekitUrl,
        token: response.token,
        roomName: response.roomName,
      });

      if (this.destroyed) {
        await this.call.disconnect();
        return;
      }

      // The user may cancel while LiveKit is still connecting.
      if (!this.call.joined()) return;

      this.rememberCallSession();
      this.callStatusParticipantCount.set(this.call.participants().length);
      this.callActive.set(true);
      this.callStatusLoading.set(false);
    } catch (error: unknown) {
      if (restoringSession) this.forgetCallSession();
      let message = describeError(error);
      if (isCallFullError(message)) {
        await this.refreshCallStatus();
        message = this.callFullMessage(true);
      }
      this.actionNotice.set(
        restoringSession ? `Could not restore your call automatically. ${message}` : message,
      );
    } finally {
      this.callJoining.set(false);
      this.restoringCallSession.set(false);
    }
  }

  protected async leaveCall(): Promise<void> {
    this.forgetCallSession();

    const remainingParticipantCount = Math.max(0, this.call.participants().length - 1);

    // Keep the pre-join card accurate immediately, then confirm it against the
    // server after LiveKit has completed the disconnect.
    this.callStatusParticipantCount.set(remainingParticipantCount);
    this.callActive.set(remainingParticipantCount > 0);
    this.callStatusLoading.set(false);

    await this.call.disconnect();
    await this.refreshCallStatus();
  }

  protected toggleMic(): void {
    void this.call.toggleMic();
  }

  protected toggleScreenShare(): void {
    void this.call.toggleScreenShare();
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

  protected requestRoomExit(): void {
    if (!this.shouldConfirmRoomExit()) {
      this.allowNavigation = true;
      void this.router.navigate(['/guests']);
      return;
    }

    this.confirmation.set({ kind: this.isOwner() ? 'close' : 'leave' });
  }

  protected requestModeration(
    kind: Extract<ConfirmationKind, 'kick' | 'block'>,
    participant: CallParticipant,
  ): void {
    if (!this.isOwner() || participant.isLocal || participant.isOwner || !participant.memberId) {
      return;
    }

    this.moderationReasonControl.setValue('');
    this.confirmation.set({ kind, participant });
  }

  protected cancelConfirmation(): void {
    if (this.confirmationPending()) return;
    this.confirmation.set(null);
    this.moderationReasonControl.setValue('');
    this.pendingNavigationResolution?.(false);
    this.pendingNavigationResolution = null;
  }

  protected async confirmAction(): Promise<void> {
    const confirmation = this.confirmation();
    if (!confirmation || this.confirmationPending()) return;

    this.confirmationPending.set(true);
    try {
      if (confirmation.kind === 'kick' || confirmation.kind === 'block') {
        await this.performModeration(confirmation);
      } else {
        await this.performRoomExit(confirmation.kind);
      }
    } catch (error: unknown) {
      this.showActionError(error);
    } finally {
      this.confirmationPending.set(false);
    }
  }

  protected toggleChatPanel(): void {
    this.chatCollapsed.update((collapsed) => !collapsed);
  }

  protected toggleRoomChatAccess(): void {
    if (this.desktopLayout()) {
      this.toggleChatPanel();
    } else {
      this.mobileChatOpen.update((open) => !open);
    }
  }

  protected confirmationTitle(): string {
    const confirmation = this.confirmation();
    if (!confirmation) return '';
    switch (confirmation.kind) {
      case 'leave':
        return 'Leave this room?';
      case 'close':
        return 'Close this room for everyone?';
      case 'kick':
        return `Kick ${confirmation.participant?.name ?? 'this member'}?`;
      case 'block':
        return `Block ${confirmation.participant?.name ?? 'this member'}?`;
    }
  }

  protected confirmationDescription(): string {
    const kind = this.confirmation()?.kind;
    switch (kind) {
      case 'leave':
        return 'You will leave the conversation and can use the invite link to join again later.';
      case 'close':
        return 'Closing ends the room for every member, disconnects the active call, and cannot be undone.';
      case 'kick':
        return 'They will be removed from the room and call now, but can use the invite link to join again later.';
      case 'block':
        return 'They will be removed immediately and this Supabase account will not be able to join this room again.';
      default:
        return '';
    }
  }

  protected confirmationActionLabel(): string {
    switch (this.confirmation()?.kind) {
      case 'leave':
        return 'Leave room';
      case 'close':
        return 'Close room';
      case 'kick':
        return 'Kick member';
      case 'block':
        return 'Block member';
      default:
        return 'Confirm';
    }
  }

  protected confirmationUsesReason(): boolean {
    const kind = this.confirmation()?.kind;
    return kind === 'kick' || kind === 'block';
  }

  protected confirmationIsDestructive(): boolean {
    const kind = this.confirmation()?.kind;
    return kind === 'close' || kind === 'block';
  }

  protected dismissNotice(): void {
    this.actionNotice.set(null);
    this.call.dismissError();
  }

  protected guestInviteLink(): string {
    const path = `/guest/${this.inviteCode}`;
    return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  }

  protected goToGuests(): void {
    this.requestRoomExit();
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.allowNavigation || !this.shouldConfirmRoomExit()) return true;

    return new Promise<boolean>((resolve) => {
      this.pendingNavigationResolution?.(false);
      this.pendingNavigationResolution = resolve;
      this.confirmation.set({ kind: this.isOwner() ? 'close' : 'leave' });
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeBrowserExit(event: BeforeUnloadEvent): void {
    if (!this.shouldConfirmRoomExit()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('document:keydown.escape')
  protected closeConfirmationFromKeyboard(): void {
    if (this.confirmation()) this.cancelConfirmation();
  }

  private async performRoomExit(kind: Extract<ConfirmationKind, 'leave' | 'close'>): Promise<void> {
    this.forgetCallSession();
    await this.call.disconnect();

    if (kind === 'close') {
      await this.guest.close();
    } else {
      await this.guest.leave();
    }

    this.allowNavigation = true;
    this.confirmation.set(null);
    const navigationResolution = this.pendingNavigationResolution;
    this.pendingNavigationResolution = null;
    if (navigationResolution) {
      navigationResolution(true);
    } else {
      await this.router.navigate(['/guests']);
    }
  }

  private async performModeration(confirmation: ModerationConfirmation): Promise<void> {
    const participant = confirmation.participant;
    if (!participant?.memberId || participant.isLocal || participant.isOwner || !this.isOwner()) {
      throw new Error('Only the room owner can moderate another active member.');
    }

    const reason = this.moderationReasonControl.value.trim();
    if (reason.length > MAX_MODERATION_REASON_LENGTH) {
      throw new Error(`Reason must be ${MAX_MODERATION_REASON_LENGTH} characters or fewer.`);
    }

    if (confirmation.kind === 'block') {
      await this.guest.blockMember(participant.memberId, reason || undefined);
    } else {
      await this.guest.kickMember(participant.memberId, reason || undefined);
    }

    this.confirmation.set(null);
    this.moderationReasonControl.setValue('');

    const actionLabel = confirmation.kind === 'block' ? 'blocked' : 'kicked';
    try {
      const request = CallParticipantRemovalRequestSchema.parse({
        channelId: this.guest.channel()?.id,
        memberId: participant.memberId,
      });
      const raw = await firstValueFrom(
        this.http.post<unknown>(`${this.apiUrl()}/livekit/remove-participant`, request),
      );
      CallParticipantRemovalResponseSchema.parse(raw);
      this.actionNotice.set(`${participant.name} was ${actionLabel} from the room.`);
    } catch (error: unknown) {
      this.actionNotice.set(
        `${participant.name} was ${actionLabel} from the room. ${describeError(error)}`,
      );
    }
  }

  private shouldConfirmRoomExit(): boolean {
    const channel = this.guest.channel();
    const member = this.guest.currentMember();
    return (
      this.status() === 'ready' &&
      channel?.status === 'active' &&
      Date.parse(channel.expires_at) > Date.now() &&
      member !== null &&
      member.left_at === null &&
      member.removed_at === null
    );
  }

  private parseDisplayName(): string | null {
    this.nameControl.setErrors(null);
    const result = guestDisplayNameSchema.safeParse(this.nameControl.value);
    if (result.success) return result.data;

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
    // The room itself is ready, but the call state is still unknown until the
    // first server status request completes. Keeping this separate prevents
    // the inactive purple card from flashing before a live call is detected.
    this.callStatusLoading.set(true);
    this.status.set('ready');
    if (this.openShareAfterCreation) this.shareRoomOpen.set(true);
    queueMicrotask(() => this.roomChat()?.scrollToNewest(false));
    this.startCallStatusPolling();

    // sessionStorage survives a refresh in the same tab. If this member had
    // joined the call before the refresh, request a fresh token and reconnect
    // with the same LiveKit identity instead of leaving them on the join card.
    if (this.hasRememberedCallSession()) {
      queueMicrotask(() => void this.joinCall(true));
    }
  }

  private startCallStatusPolling(): void {
    if (!this.hasAuthenticatedSession()) {
      this.stopCallStatusPolling();
      return;
    }

    this.stopCallStatusPolling();

    void this.refreshCallStatus();
    this.callStatusIntervalId = setInterval(
      () => void this.refreshCallStatus(),
      CALL_STATUS_POLL_MS,
    );
  }

  private async refreshCallStatus(): Promise<void> {
    if (!this.hasAuthenticatedSession()) {
      this.stopCallStatusPolling();
      return;
    }

    if (this.call.joined()) {
      const participantCount = this.call.participants().length;
      this.callStatusParticipantCount.set(participantCount);
      this.callActive.set(true);
      this.callStatusLoading.set(false);
      return;
    }

    const channelId = this.guest.channel()?.id;
    if (!channelId || this.callStatusPollInFlight) return;

    this.callStatusPollInFlight = true;
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(`${this.apiUrl()}/channels/${channelId}/call-status`),
      );
      const response = CallStatusResponseSchema.parse(raw);

      this.callStatusParticipantCount.set(response.participants);
      this.callActive.set(response.active || response.participants > 0);
      this.callStatusLoading.set(false);
    } catch {
      // Keep the last known call state during a temporary API or LiveKit
      // outage. Reporting a live call as empty is more misleading than
      // briefly displaying the previous confirmed value.
    } finally {
      this.callStatusPollInFlight = false;
    }
  }

  private stopCallStatusPolling(): void {
    if (this.callStatusIntervalId) clearInterval(this.callStatusIntervalId);
    this.callStatusIntervalId = null;
  }

  private hasAuthenticatedSession(): boolean {
    return this.auth.status() === 'anonymous' || this.auth.status() === 'authenticated';
  }

  private hasRememberedCallSession(): boolean {
    const key = this.callSessionStorageKey();
    if (!key || typeof window === 'undefined') return false;

    try {
      return window.sessionStorage.getItem(key) === 'joined';
    } catch {
      return false;
    }
  }

  private rememberCallSession(): void {
    const key = this.callSessionStorageKey();
    if (!key || typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(key, 'joined');
    } catch {
      // Call restoration is a progressive enhancement; the active call still works.
    }
  }

  private forgetCallSession(): void {
    const key = this.callSessionStorageKey();
    if (!key || typeof window === 'undefined') return;

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage restrictions while still allowing the user to leave.
    }
  }

  private callSessionStorageKey(): string | null {
    const channelId = this.guest.channel()?.id;
    return channelId ? `${CALL_SESSION_KEY_PREFIX}${channelId}` : null;
  }

  private handleEntryError(error: unknown): void {
    const message = describeError(error);
    this.errorMessage.set(message);
    this.status.set(/not found|invalid invite/i.test(message) ? 'not-found' : 'error');
  }

  private showActionError(error: unknown): void {
    this.actionNotice.set(describeError(error));
  }

  private callFullMessage(race: boolean): string {
    const prefix = race ? 'The call just became full.' : 'Call full.';
    return `${prefix} ${this.callParticipantCount()} of ${this.callCapacity()} participants are currently in the call. You can stay in the room and join when a spot becomes available.`;
  }

  private apiUrl(): string {
    return environment.apiUrl.replace(/\/$/, '');
  }
}

function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const nestedMessage = readMessage(Reflect.get(error, 'error'));
    if (nestedMessage) return nestedMessage;
  }

  return readMessage(error) || 'The room request failed.';
}

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return '';

  const message = Reflect.get(value, 'message');
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string').join(' ');
  }
  return typeof message === 'string' ? message : '';
}

function isCallFullError(message: string): boolean {
  return /call.+full|room.+full|max(?:imum)? participants|participant limit|resource exhausted/i.test(
    message,
  );
}

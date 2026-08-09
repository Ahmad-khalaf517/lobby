import { HttpClient, HttpContext } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  CallStatusResponseSchema,
  CallTokenResponseSchema,
  MAX_CALL_PARTICIPANTS,
  MAX_CHANNEL_NAME_LENGTH,
  type Channel,
  type CallStatusResponse,
  type ServerWithChannels,
} from '@lobby/shared';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../../core/auth-http-context';
import { AuthService } from '../../auth/services/auth';
import { ChannelChatPanel } from '../../channel-chat/channel-chat-panel/channel-chat-panel';
import { ChannelChatStore } from '../../channel-chat/services/channel-chat.store';
import {
  CallControlBarComponent,
  CallParticipantsSidebarComponent,
  CallStageComponent,
  LiveKitCallService,
  VoiceParticipantTileComponent,
} from '../../../shared/components/call-room';
import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { LoadingStateComponent } from '../../../shared/ui/loading-state/loading-state.component';
import { ToastService } from '../../../core/toast/toast.service';
import { SessionScopeService, type SessionScope } from '../../../core/session-scope.service';
import { ConfirmModalComponent } from '../components/confirm-modal/confirm-modal.component';
import { PromptModalComponent } from '../components/prompt-modal/prompt-modal.component';
import { DashboardStore } from '../services/dashboard.store';
import { ServersService } from '../services/servers.service';

@Component({
  selector: 'app-channel-view',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    LobbyIconComponent,
    LoadingStateComponent,
    ChannelChatPanel,
    CallControlBarComponent,
    CallParticipantsSidebarComponent,
    CallStageComponent,
    VoiceParticipantTileComponent,
    PromptModalComponent,
    ConfirmModalComponent,
  ],
  templateUrl: './channel-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ChannelView {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly serversService = inject(ServersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly channelChat = inject(ChannelChatStore);

  protected readonly dashboardStore = inject(DashboardStore);

  protected readonly call = inject(LiveKitCallService);

  protected readonly server = signal<ServerWithChannels | null>(null);
  protected readonly channelId = signal<string | null>(null);
  protected readonly channel = computed(
    () => this.server()?.channels.find((candidate) => candidate.id === this.channelId()) ?? null,
  );
  protected readonly channelStatus = signal<CallStatusResponse | null>(null);

  protected readonly callJoining = signal(false);
  protected readonly callError = signal<string | null>(null);
  protected readonly participantsPanelOpen = signal(false);
  protected readonly channelMenuOpenFor = signal<string | null>(null);
  protected readonly channelMenuPosition = signal<{ top: number; left: number } | null>(null);

  protected readonly renameTarget = signal<Channel | null>(null);
  protected readonly renameSaving = signal(false);
  protected readonly renameError = signal<string | null>(null);
  protected readonly maxChannelNameLength = MAX_CHANNEL_NAME_LENGTH;

  protected readonly deleteTarget = signal<Channel | null>(null);
  protected readonly deleteSaving = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly addChannelOpen = signal(false);
  protected readonly addChannelSaving = signal(false);
  protected readonly addChannelError = signal<string | null>(null);

  protected readonly mobileChatOpen = signal(false);
  protected readonly chatCollapsed = signal(false);
  protected readonly fullscreenActive = signal(false);

  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  protected readonly isOwner = computed(() => this.server()?.ownerId === this.currentUserId());
  protected readonly callIsLive = computed(() => this.channelStatus()?.active === true);
  protected readonly hasCallContextHere = computed(
    () => this.dashboardStore.activeCall()?.channelId === this.channelId(),
  );
  protected readonly showSplitView = computed(
    () => this.hasCallContextHere() || this.isInCallHere() || this.callIsLive(),
  );
  protected readonly roster = computed(() => {
    const server = this.server();
    return server ? this.dashboardStore.membersFor(server.id) : [];
  });
  protected readonly chatMemberNames = computed(() => this.roster().map((member) => member.name));
  protected readonly currentUserName = computed(() => {
    const rosterName = this.roster().find((member) => member.userId === this.currentUserId())?.name;
    const metadataName = this.auth.user()?.userMetadata['name'];
    return rosterName ?? (typeof metadataName === 'string' ? metadataName : 'You');
  });
  protected readonly displayedCallError = computed(() => this.callError() ?? this.call.error());
  protected readonly callCapacity = computed(
    () => this.channelStatus()?.maxParticipants ?? MAX_CALL_PARTICIPANTS,
  );

  protected readonly tabLinks = viewChildren<ElementRef<HTMLElement>>('tabLink');
  protected readonly tabScroller = viewChild<ElementRef<HTMLElement>>('tabScroller');
  protected readonly tabIndicator = signal<{ left: number; width: number } | null>(null);
  private readonly callWorkspace = viewChild<ElementRef<HTMLElement>>('callWorkspace');

  protected readonly participants = this.call.participants;
  protected readonly participantCount = computed(() => this.participants().length);
  protected readonly activeScreenShare = this.call.activeScreenShare;

  /**
   * A call can be connected in a DIFFERENT channel than the one currently
   * being viewed (it survives navigation — see the constructor note below).
   * The call controls in this header should only read as "active" when
   * they're for the channel actually being viewed, not just because some
   * call is joined somewhere.
   */
  protected readonly isInCallHere = computed(
    () => this.call.joined() && this.dashboardStore.activeCall()?.channelId === this.channelId(),
  );

  private serverId = '';
  private statusIntervalId: ReturnType<typeof setInterval> | null = null;
  private statusPollingChannelId: string | null = null;
  private statusRequestChannelId: string | null = null;
  private loadRevision = 0;
  private callJoinRevision = 0;
  private restoreAttemptedFor: string | null = null;
  private destroyed = false;
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  constructor() {
    const unregister = this.sessionScope.registerCleanup(() => this.resetSessionState());
    this.destroyRef.onDestroy(unregister);

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      this.serverId = paramMap.get('serverId') ?? '';
      const channelId = paramMap.get('channelId');
      this.channelId.set(channelId);
      if (this.serverId && channelId) {
        void this.loadServerAndPoll(this.serverId, channelId);
        void this.channelChat.open(channelId).catch(() => undefined);
      }
    });

    // Re-measures the active tab's position once the DOM reflects it — after
    // the channel list renders and each time the active channel changes —
    // so the shared underline can animate from its old spot to the new one.
    effect(() => {
      this.channelId();
      this.tabLinks();
      queueMicrotask(() => this.measureTabIndicator());
    });

    effect(() => {
      const activeChannelId = this.channelId();
      if (this.sessionScope.userId() && this.serverId && activeChannelId) {
        void this.loadServerAndPoll(this.serverId, activeChannelId);
        void this.channelChat.open(activeChannelId).catch(() => undefined);
      }
    });

    // Deliberately does NOT disconnect the call here — a voice call must
    // survive navigating to a different channel/server (that's the whole
    // point of the rail's persistent call widget). Only an explicit "Leave"
    // click (leaveCall(), or the widget's own) disconnects.
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.callJoinRevision += 1;
      this.stopStatusPolling();
      void this.channelChat.close();
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.mobileChatOpen.set(false);
      this.channelMenuOpenFor.set(null);
    });

    if (typeof document !== 'undefined') {
      const onFullscreenChange = (): void => {
        this.fullscreenActive.set(
          document.fullscreenElement === this.callWorkspace()?.nativeElement,
        );
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener('fullscreenchange', onFullscreenChange);
      });
    }
  }

  protected async toggleFullscreen(): Promise<void> {
    if (typeof document === 'undefined') return;
    const element = this.callWorkspace()?.nativeElement;
    if (!element) return;

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      // The browser may reject fullscreen when it is unavailable or blocked.
    }
  }

  protected toggleChatPanel(): void {
    this.chatCollapsed.update((collapsed) => !collapsed);
  }

  protected toggleChannelMenu(channelId: string, event: MouseEvent): void {
    if (this.channelMenuOpenFor() === channelId) {
      this.closeChannelMenu();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.channelMenuPosition.set({ top: rect.bottom + 4, left: rect.left });
    this.channelMenuOpenFor.set(channelId);
  }

  protected closeChannelMenu(): void {
    this.channelMenuOpenFor.set(null);
  }

  protected requestDeleteChannel(channel: Channel): void {
    this.closeChannelMenu();
    this.deleteError.set(null);
    this.deleteTarget.set(channel);
  }

  protected cancelDeleteChannel(): void {
    if (this.deleteSaving()) return;
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.channelMenuOpenFor()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-channel-menu-scope]')) return;
    this.closeChannelMenu();
  }

  protected renameChannel(channel: Channel): void {
    this.closeChannelMenu();
    this.renameError.set(null);
    this.renameTarget.set(channel);
  }

  protected cancelRenameChannel(): void {
    if (this.renameSaving()) return;
    this.renameTarget.set(null);
    this.renameError.set(null);
  }

  protected async submitRenameChannel(name: string): Promise<void> {
    const scope = this.requireScope();
    const channel = this.renameTarget();
    const server = this.server();
    if (!channel || !server || name === channel.name) {
      this.renameTarget.set(null);
      return;
    }

    this.renameSaving.set(true);
    this.renameError.set(null);
    try {
      const updated = await this.serversService.updateChannel(server.id, channel.id, name);
      this.assertCurrent(scope);
      const nextServer: ServerWithChannels = {
        ...server,
        channels: server.channels.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      };
      this.server.set(nextServer);
      this.dashboardStore.cacheChannels(server.id, nextServer.channels);
      this.renameTarget.set(null);
      this.toast.success(`Channel renamed to "${name}"`);
    } catch {
      this.renameError.set('Could not rename the channel. Please try again.');
    } finally {
      this.renameSaving.set(false);
    }
  }

  protected async submitDeleteChannel(): Promise<void> {
    const scope = this.requireScope();
    const channel = this.deleteTarget();
    const server = this.server();
    if (!channel || !server) return;

    this.deleteSaving.set(true);
    this.deleteError.set(null);
    try {
      await this.serversService.deleteChannel(server.id, channel.id);
      this.assertCurrent(scope);
      const remaining = server.channels.filter((candidate) => candidate.id !== channel.id);
      const nextServer: ServerWithChannels = { ...server, channels: remaining };
      this.server.set(nextServer);
      this.dashboardStore.cacheChannels(server.id, remaining);
      this.deleteTarget.set(null);
      this.toast.success(`Channel "${channel.name}" deleted`);

      if (this.dashboardStore.activeCall()?.channelId === channel.id) {
        await this.leaveCall();
      }

      if (this.channelId() === channel.id) {
        const next = remaining[0];
        if (next) await this.router.navigate(['/app/servers', server.id, 'channels', next.id]);
      }
    } catch {
      this.deleteError.set(
        'A server needs at least one channel — create another before deleting this one.',
      );
    } finally {
      this.deleteSaving.set(false);
    }
  }

  protected startAddingChannel(): void {
    this.addChannelError.set(null);
    this.addChannelOpen.set(true);
  }

  protected cancelAddingChannel(): void {
    if (this.addChannelSaving()) return;
    this.addChannelOpen.set(false);
    this.addChannelError.set(null);
  }

  protected async submitNewChannel(name: string): Promise<void> {
    const scope = this.requireScope();
    const server = this.server();
    if (!server) return;

    this.addChannelSaving.set(true);
    this.addChannelError.set(null);
    try {
      const channel = await this.serversService.createChannel(server.id, name);
      this.assertCurrent(scope);
      const updated: ServerWithChannels = { ...server, channels: [...server.channels, channel] };
      this.server.set(updated);
      this.dashboardStore.cacheChannels(server.id, updated.channels);
      this.addChannelOpen.set(false);
      this.toast.success(`Channel "${channel.name}" created`);
      await this.router.navigate(['/app/servers', server.id, 'channels', channel.id]);
    } catch {
      this.addChannelError.set('Could not create the channel. Please try again.');
    } finally {
      this.addChannelSaving.set(false);
    }
  }

  protected toggleMic(): void {
    void this.call.toggleMic();
  }

  protected toggleScreenShare(): void {
    void this.call.toggleScreenShare();
  }

  protected toggleParticipantsPanel(): void {
    this.participantsPanelOpen.update((value) => !value);
  }

  protected async joinCall(restoringSession = false): Promise<void> {
    if (this.callJoining() || this.destroyed || this.isInCallHere()) return;

    const scope = this.requireScope();
    const server = this.server();
    const channel = this.channel();
    if (!server || !channel) return;

    const revision = ++this.callJoinRevision;
    this.callJoining.set(true);
    this.callError.set(null);
    this.call.dismissError();

    try {
      const raw = await firstValueFrom(
        this.http.post<unknown>(`${this.apiUrl}/server-channels/${channel.id}/call-token`, {}),
      );
      const response = CallTokenResponseSchema.parse(raw);
      this.assertCurrent(scope);
      if (revision !== this.callJoinRevision || this.destroyed || this.channelId() !== channel.id) {
        return;
      }

      await this.call.connect({
        livekitUrl: response.livekitUrl,
        token: response.token,
        roomName: response.roomName,
      });

      if (
        revision !== this.callJoinRevision ||
        this.destroyed ||
        !this.sessionScope.isCurrent(scope) ||
        this.channelId() !== channel.id
      ) {
        if (this.call.roomName() === response.roomName) await this.call.disconnect();
        return;
      }

      this.dashboardStore.setActiveCall({
        serverId: server.id,
        channelId: channel.id,
        channelName: channel.name,
        serverName: server.name,
      });
      this.channelStatus.set({
        active: true,
        participants: this.call.participants().length,
        maxParticipants: this.callCapacity(),
      });
    } catch (error: unknown) {
      if (this.sessionScope.isCurrent(scope) && revision === this.callJoinRevision) {
        if (restoringSession) this.dashboardStore.clearActiveCall();
        this.callError.set(
          restoringSession
            ? `Could not restore your call automatically. ${describeCallError(error)}`
            : describeCallError(error),
        );
      }
    } finally {
      if (revision === this.callJoinRevision) this.callJoining.set(false);
    }
  }

  protected async leaveCall(): Promise<void> {
    this.callJoinRevision += 1;
    const remainingParticipants = Math.max(0, this.call.participants().length - 1);
    this.dashboardStore.clearActiveCall();
    this.participantsPanelOpen.set(false);
    this.channelStatus.set({
      active: remainingParticipants > 0,
      participants: remainingParticipants,
      maxParticipants: this.callCapacity(),
    });
    await this.call.disconnect();
    await this.refreshCallStatus();
  }

  private async loadServerAndPoll(serverId: string, activeChannelId: string): Promise<void> {
    const scope = this.requireScope();
    const revision = ++this.loadRevision;
    this.callError.set(null);

    if (this.server()?.id !== serverId) {
      this.channelStatus.set(null);
      const server = await this.serversService.getServer(serverId);
      this.assertCurrent(scope);
      if (revision !== this.loadRevision || this.serverId !== serverId) return;
      this.server.set(server);
      this.dashboardStore.cacheChannels(server.id, server.channels);
      void this.dashboardStore.loadMembers(serverId);
    }

    this.assertCurrent(scope);
    if (
      revision !== this.loadRevision ||
      this.serverId !== serverId ||
      this.channelId() !== activeChannelId
    ) {
      return;
    }

    this.startStatusPolling(activeChannelId);
    const remembered = this.dashboardStore.restoreActiveCall();
    const restoreKey = remembered ? `${remembered.serverId}:${remembered.channelId}` : null;
    if (
      remembered?.serverId === serverId &&
      remembered.channelId === activeChannelId &&
      !this.call.joined() &&
      this.restoreAttemptedFor !== restoreKey
    ) {
      this.restoreAttemptedFor = restoreKey;
      queueMicrotask(() => void this.joinCall(true));
    }
  }

  private startStatusPolling(channelId: string): void {
    if (this.statusPollingChannelId === channelId && this.statusIntervalId) return;
    this.stopStatusPolling();
    this.statusPollingChannelId = channelId;
    this.channelStatus.set(null);
    void this.refreshCallStatus(channelId);
    this.statusIntervalId = setInterval(() => void this.refreshCallStatus(channelId), 3_000);
  }

  private async refreshCallStatus(channelId = this.channelId()): Promise<void> {
    if (!channelId || this.statusRequestChannelId === channelId) return;

    if (this.isInCallHere() && this.channelId() === channelId) {
      this.channelStatus.set({
        active: true,
        participants: this.call.participants().length,
        maxParticipants: this.callCapacity(),
      });
      return;
    }

    const scope = this.sessionScope.capture();
    if (!scope.userId) return;
    this.statusRequestChannelId = channelId;
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(`${this.apiUrl}/server-channels/${channelId}/call-status`, {
          context: new HttpContext().set(SKIP_ERROR_TOAST, true),
        }),
      );
      const response = CallStatusResponseSchema.parse(raw);
      if (this.sessionScope.isCurrent(scope) && this.channelId() === channelId) {
        this.channelStatus.set(response);
      }
    } catch {
      // Preserve the last confirmed state during a transient API/LiveKit outage.
    } finally {
      if (this.statusRequestChannelId === channelId) this.statusRequestChannelId = null;
    }
  }

  private stopStatusPolling(): void {
    if (this.statusIntervalId) clearInterval(this.statusIntervalId);
    this.statusIntervalId = null;
    this.statusPollingChannelId = null;
  }

  private resetSessionState(): void {
    this.loadRevision += 1;
    this.callJoinRevision += 1;
    this.stopStatusPolling();
    this.server.set(null);
    this.channelStatus.set(null);
    this.callError.set(null);
    this.participantsPanelOpen.set(false);
    this.channelMenuOpenFor.set(null);
    this.channelMenuPosition.set(null);
    this.renameTarget.set(null);
    this.deleteTarget.set(null);
    this.addChannelOpen.set(false);
    this.mobileChatOpen.set(false);
  }

  private requireScope(): SessionScope {
    const scope = this.sessionScope.capture();
    if (!scope.userId) throw new Error('An authenticated account is required.');
    return scope;
  }

  private assertCurrent(scope: SessionScope): void {
    if (!this.sessionScope.isCurrent(scope)) throw new Error('The authenticated account changed.');
  }

  private measureTabIndicator(): void {
    const channels = this.server()?.channels ?? [];
    const activeIndex = channels.findIndex((candidate) => candidate.id === this.channelId());
    const link = this.tabLinks()[activeIndex]?.nativeElement;
    const scroller = this.tabScroller()?.nativeElement;
    if (activeIndex === -1 || !link || !scroller) {
      this.tabIndicator.set(null);
      return;
    }

    // getBoundingClientRect (not offsetLeft) so this stays correct regardless
    // of the positioned wrapper each tab now sits in (for the owner "⋯" menu)
    // — offsetLeft would be relative to that wrapper, not the scroller.
    const scrollerRect = scroller.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    this.tabIndicator.set({
      left: linkRect.left - scrollerRect.left + scroller.scrollLeft,
      width: linkRect.width,
    });
  }
}

function describeCallError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const response = record['error'];
    if (typeof response === 'object' && response !== null) {
      const message = (response as Record<string, unknown>)['message'];
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Could not join the call. Please try again.';
}

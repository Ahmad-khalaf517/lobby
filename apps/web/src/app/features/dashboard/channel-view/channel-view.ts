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
  MAX_CHANNEL_NAME_LENGTH,
  type Channel,
  type CallStatusResponse,
  type ServerWithChannels,
} from '@lobby/shared';

import { AuthService } from '../../auth/services/auth';
import { LiveKitCallService } from '../../../shared/components/call-room';
import { RoomChatComponent } from '../../../shared/components/room-chat';
import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { LoadingStateComponent } from '../../../shared/ui/loading-state/loading-state.component';
import { ToastService } from '../../../core/toast/toast.service';
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
    RoomChatComponent,
    PromptModalComponent,
    ConfirmModalComponent,
  ],
  templateUrl: './channel-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ChannelView {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly serversService = inject(ServersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

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
  protected readonly showSplitView = computed(() => this.isInCallHere() || this.callIsLive());
  protected readonly roster = computed(() => {
    const server = this.server();
    return server ? this.dashboardStore.membersFor(server.id) : [];
  });

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
  protected readonly isInCallHere = computed(() => false);

  private serverId = '';
  private statusIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      this.serverId = paramMap.get('serverId') ?? '';
      const channelId = paramMap.get('channelId');
      this.channelId.set(channelId);
      if (this.serverId && channelId) void this.loadServerAndPoll(this.serverId);
    });

    // Re-measures the active tab's position once the DOM reflects it — after
    // the channel list renders and each time the active channel changes —
    // so the shared underline can animate from its old spot to the new one.
    effect(() => {
      this.channelId();
      this.tabLinks();
      queueMicrotask(() => this.measureTabIndicator());
    });

    // Deliberately does NOT disconnect the call here — a voice call must
    // survive navigating to a different channel/server (that's the whole
    // point of the rail's persistent call widget). Only an explicit "Leave"
    // click (leaveCall(), or the widget's own) disconnects.
    this.destroyRef.onDestroy(() => {
      this.stopStatusPolling();
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
    const channel = this.deleteTarget();
    const server = this.server();
    if (!channel || !server) return;

    this.deleteSaving.set(true);
    this.deleteError.set(null);
    try {
      await this.serversService.deleteChannel(server.id, channel.id);
      const remaining = server.channels.filter((candidate) => candidate.id !== channel.id);
      const nextServer: ServerWithChannels = { ...server, channels: remaining };
      this.server.set(nextServer);
      this.dashboardStore.cacheChannels(server.id, remaining);
      this.deleteTarget.set(null);
      this.toast.success(`Channel "${channel.name}" deleted`);

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
    const server = this.server();
    if (!server) return;

    this.addChannelSaving.set(true);
    this.addChannelError.set(null);
    try {
      const channel = await this.serversService.createChannel(server.id, name);
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

  private async loadServerAndPoll(serverId: string): Promise<void> {
    this.channelStatus.set(null);
    this.callError.set(null);

    if (this.server()?.id !== serverId) {
      const server = await this.serversService.getServer(serverId);
      this.server.set(server);
      this.dashboardStore.cacheChannels(server.id, server.channels);
      void this.dashboardStore.loadMembers(serverId);
    }
  }

  private stopStatusPolling(): void {
    if (this.statusIntervalId) clearInterval(this.statusIntervalId);
    this.statusIntervalId = null;
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

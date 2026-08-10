import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { Server } from '@lobby/shared';

import { LiveKitCallService } from '../../../../shared/components/call-room';
import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { FriendsService } from '../../../friends/friends.service';
import { DirectMessagesService } from '../../../messages/messages.service';
import { DashboardStore } from '../../services/dashboard.store';
import { ServerIconComponent } from '../server-icon/server-icon.component';

@Component({
  selector: 'app-server-rail',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LobbyIconComponent, ServerIconComponent],
  templateUrl: './server-rail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ServerRailComponent {
  readonly activeServerId = input<string | null>(null);
  /** Whether the mobile/tablet drawer is open. Ignored at the `lg` breakpoint and up, where the rail is always visible. */
  readonly mobileOpen = input<boolean>(false);
  readonly closeMobile = output<void>();

  protected readonly store = inject(DashboardStore);
  protected readonly call = inject(LiveKitCallService);
  private readonly friendsService = inject(FriendsService);
  private readonly directMessages = inject(DirectMessagesService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Incoming requests only — outgoing ones you sent don't need your action. */
  protected readonly pendingFriendRequests = computed(
    () => this.friendsService.pendingIncoming().length,
  );
  protected readonly unreadMessages = this.directMessages.totalUnread;

  protected readonly addMenuOpen = signal(false);

  constructor() {
    // Self-heals the widget if the call ends for any reason other than the
    // explicit "Leave" click (e.g. a dropped connection) — those already
    // clear it themselves.

    // The rail is part of the dashboard shell and renders before the Friends
    // page might ever be visited, so it needs its own load to show the badge.
    void this.friendsService.ensureLoaded();
  }

  protected toggleMic(): void {
    void this.call.toggleMic();
  }

  protected leaveCall(): void {
    this.store.clearActiveCall();
    void this.call.disconnect();
  }

  /** Links straight to a channel once we know one (cached from a prior visit); falls back to the bare server route, which redirects. */
  protected serverLink(server: Server): (string | undefined)[] {
    const channelId = this.store.firstChannelId(server.id);
    return channelId
      ? ['/app/servers', server.id, 'channels', channelId]
      : ['/app/servers', server.id];
  }

  protected toggleAddMenu(): void {
    this.addMenuOpen.update((value) => !value);
  }

  protected createServer(): void {
    this.addMenuOpen.set(false);
    this.store.openCreateModal();
  }

  protected joinServer(): void {
    this.addMenuOpen.set(false);
    this.store.openJoinModal();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.addMenuOpen()) return;
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.addMenuOpen.set(false);
    }
  }
}

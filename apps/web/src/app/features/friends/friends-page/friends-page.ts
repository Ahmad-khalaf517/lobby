import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PersonAvatarComponent } from '../../../shared/components/person-avatar/person-avatar.component';
import type { Person } from '../../../shared/components/person-avatar/person.model';
import type { Friend } from '../friends.models';
import { FriendsService } from '../friends.service';

export type FriendsTab = 'all' | 'pending' | 'blocked';

/**
 * Friends page (route `/friends`). Renders the mockup's friends panel: tabs for
 * All friends / Pending / Blocked, the friend list with hover actions, and the
 * Add Friend + Blocked side panel. All state is local mock state owned by
 * <app-friends-service>; the Message button navigates to the DMs page.
 */
@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [RouterLink, PersonAvatarComponent],
  templateUrl: './friends-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendsPage {
  private readonly friendsService = inject(FriendsService);
  private readonly router = inject(Router);

  protected readonly friends = this.friendsService.friends;
  protected readonly pendingIncoming = this.friendsService.pendingIncoming;
  protected readonly pendingOutgoing = this.friendsService.pendingOutgoing;
  protected readonly blocked = this.friendsService.blocked;
  protected readonly pendingCount = this.friendsService.pendingCount;

  protected readonly activeTab = signal<FriendsTab>('all');
  protected readonly addFriendQuery = signal('');
  protected readonly addFriendNotice = signal<string | null>(null);
  protected readonly moreMenuFor = signal<string | null>(null);

  protected setTab(tab: FriendsTab): void {
    this.activeTab.set(tab);
    this.moreMenuFor.set(null);
  }

  protected tabClass(tab: FriendsTab): string {
    const base = 'flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition';
    return this.activeTab() === tab
      ? `${base} bg-primary/15 font-medium text-[#c9bbff]`
      : `${base} text-[#9aa4b2] hover:bg-[#16161d]`;
  }

  protected statusLabel(friend: Person): string {
    if (friend.status === 'online') {
      return 'Online';
    }
    return friend.lastSeen ? `Offline · seen ${friend.lastSeen}` : 'Offline';
  }

  protected accept(requestId: string): void {
    this.friendsService.accept(requestId);
  }

  protected reject(requestId: string): void {
    this.friendsService.reject(requestId);
  }

  protected cancel(requestId: string): void {
    this.friendsService.cancel(requestId);
  }

  protected unblock(userId: string): void {
    this.friendsService.unblock(userId);
  }

  protected removeFriend(friend: Friend): void {
    this.friendsService.removeFriend(friend.id);
    this.moreMenuFor.set(null);
  }

  protected toggleMoreMenu(friendId: string): void {
    this.moreMenuFor.update((current) => (current === friendId ? null : friendId));
  }

  protected openConversation(friendId: string): void {
    void this.router.navigate(['/messages', friendId]);
  }

  protected onAddFriendInput(event: Event): void {
    this.addFriendQuery.set((event.target as HTMLInputElement).value);
  }

  protected sendRequest(): void {
    const request = this.friendsService.sendFriendRequest(this.addFriendQuery());
    this.addFriendQuery.set('');
    if (request) {
      this.addFriendNotice.set(`Friend request sent to ${request.name}`);
    } else {
      this.addFriendNotice.set(null);
    }
  }

  protected focusAddFriend(): void {
    const panel = document.getElementById('add-friend-panel');
    if (!panel) {
      return;
    }
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const input = panel.querySelector<HTMLInputElement>('input');
      input?.focus();
    } else {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.moreMenuFor()) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && !target.closest('[data-friend-more-menu]')) {
      this.moreMenuFor.set(null);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { UserProfile } from '@lobby/shared';
import { AuthService } from '../../auth/services/auth';
import { DirectMessagesService } from '../../messages/messages.service';
import { ProfilePopupService } from '../../profile/services/profile-popup.service';
import { PersonAvatarComponent } from '../../../shared/components/person-avatar/person-avatar.component';
import type { Person } from '../../../shared/components/person-avatar/person.model';
import { personFromProfile } from '../../../shared/components/person-avatar/person.util';
import { UserPopoverAvatarComponent } from '../../../shared/components/user-popover/user-popover-avatar.component';
import type { Friend } from '../friends.models';
import { FriendsService } from '../friends.service';
import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { SessionScopeService } from '../../../core/session-scope.service';

export type FriendsTab = 'all' | 'pending' | 'blocked';

/**
 * Friends page (route `/friends`). Renders the mockup's friends panel: tabs for
 * All friends / Pending / Blocked, the friend list with hover actions, and the
 * Add Friend + Blocked side panel. State comes from the friendships REST API via
 * <app-friends-service>; the Message button navigates to the DMs page.
 */
@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [RouterLink, PersonAvatarComponent, UserPopoverAvatarComponent, LobbyIconComponent],
  templateUrl: './friends-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class FriendsPage {
  private readonly friendsService = inject(FriendsService);
  private readonly directMessages = inject(DirectMessagesService);
  private readonly profilePopup = inject(ProfilePopupService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionScope = inject(SessionScopeService);

  protected readonly friends = this.friendsService.friends;
  protected readonly pendingIncoming = this.friendsService.pendingIncoming;
  protected readonly pendingOutgoing = this.friendsService.pendingOutgoing;
  protected readonly blocked = this.friendsService.blocked;
  protected readonly pendingCount = this.friendsService.pendingCount;
  protected readonly loading = this.friendsService.loading;
  protected readonly loadError = this.friendsService.error;

  protected readonly activeTab = signal<FriendsTab>('all');
  protected readonly addFriendQuery = signal('');
  protected readonly addFriendNotice = signal<string | null>(null);
  protected readonly addFriendOpen = signal(false);
  protected readonly moreMenuFor = signal<string | null>(null);
  protected readonly searchResults = signal<UserProfile[]>([]);
  protected readonly searching = signal(false);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const unregister = this.sessionScope.registerCleanup(() => this.resetSelections());
    this.destroyRef.onDestroy(unregister);
    void this.friendsService.load();
  }

  private resetSelections(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.activeTab.set('all');
    this.addFriendQuery.set('');
    this.addFriendNotice.set(null);
    this.addFriendOpen.set(false);
    this.moreMenuFor.set(null);
    this.searchResults.set([]);
    this.searching.set(false);
  }

  protected setTab(tab: FriendsTab): void {
    this.activeTab.set(tab);
    this.moreMenuFor.set(null);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      this.addFriendOpen.set(false);
    }
  }

  /** Toggle the Add friend panel; focus its search after it becomes visible. */
  protected toggleAddFriend(): void {
    const opening = !this.addFriendOpen();
    this.addFriendOpen.set(opening);
    if (opening) {
      setTimeout(() => this.focusAddFriend(), 0);
    }
  }

  protected tabClass(tab: FriendsTab): string {
    const base =
      'flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] transition sm:flex-none sm:px-3.5 sm:text-sm';
    return this.activeTab() === tab
      ? `${base} bg-primary/15 font-medium text-[#c9bbff]`
      : `${base} text-app-muted hover:bg-[#16161d]`;
  }

  protected statusLabel(friend: Person): string {
    if (friend.status === 'online') {
      return 'Online';
    }
    return friend.lastSeen ? `Offline · seen ${friend.lastSeen}` : 'Offline';
  }

  protected accept(requestId: string): void {
    void this.friendsService.accept(requestId);
  }

  protected reject(requestId: string): void {
    void this.friendsService.reject(requestId);
  }

  protected cancel(requestId: string): void {
    void this.friendsService.cancel(requestId);
  }

  protected unblock(userId: string): void {
    void this.friendsService.unblock(userId);
  }

  protected removeFriend(friend: Friend): void {
    void this.friendsService.removeFriend(friend.friendshipId);
    this.moreMenuFor.set(null);
  }

  protected blockFriend(friend: Friend): void {
    void this.friendsService.block(friend.id);
    this.moreMenuFor.set(null);
  }

  protected deleteChat(friend: Friend): void {
    void this.directMessages.clearChatHistory(friend.id);
    this.moreMenuFor.set(null);
  }

  protected toggleMoreMenu(friendId: string): void {
    this.moreMenuFor.update((current) => (current === friendId ? null : friendId));
  }

  protected openConversation(friendId: string, person?: Person): void {
    void this.router.navigate(
      ['/app/messages', friendId],
      person ? { state: { person } } : undefined,
    );
  }

  protected onAddFriendInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.addFriendQuery.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.runSearch(value), 300);
  }

  protected async runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.addFriendNotice.set(null);
    try {
      const results = await this.friendsService.searchUsers(trimmed);
      const selfId = this.auth.user()?.id;
      const knownIds = new Set([
        ...this.friends().map((friend) => friend.id),
        ...this.pendingIncoming().map((request) => request.id),
        ...this.pendingOutgoing().map((request) => request.id),
        ...this.blocked().map((user) => user.id),
      ]);
      this.searchResults.set(
        results.filter((result) => result.userId !== selfId && !knownIds.has(result.userId)),
      );
    } catch {
      this.searchResults.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  protected async addFriend(profile: UserProfile): Promise<void> {
    try {
      await this.friendsService.sendFriendRequest(profile.userId);
      this.addFriendNotice.set(`Friend request sent to ${profile.displayName}`);
      await this.runSearch(this.addFriendQuery());
    } catch {
      this.addFriendNotice.set('Could not send the friend request.');
    }
  }

  protected openProfile(profile: UserProfile): void {
    this.profilePopup.open(profile.userId);
  }

  protected openMyProfile(): void {
    const userId = this.auth.user()?.id;
    if (userId) {
      this.profilePopup.open(userId);
    }
  }

  protected toPerson(profile: UserProfile): Person {
    return personFromProfile(profile);
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

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  MAX_SERVER_NAME_LENGTH,
  type Notification,
  type Server,
  type UserProfile,
} from '@lobby/shared';

import { AuthService } from '../../../auth/services/auth';
import { ChatAvatarComponent } from '../../../../shared/components/room-chat';
import {
  LobbyIconComponent,
  type LobbyIconName,
} from '../../../../shared/ui/icon/lobby-icon.component';
import { LogoComponent } from '../../../../shared/ui/logo/lobby-logo.component';
import { ToastService } from '../../../../core/toast/toast.service';
import { ProfilePopupService } from '../../../profile/services/profile-popup.service';
import { ProfileService } from '../../../profile/services/profile.service';
import { SettingsPopupService } from '../../../account-settings/services/settings-popup.service';
import { DirectMessagesService } from '../../../messages/messages.service';
import { FriendsService } from '../../../friends/friends.service';
import { NotificationsService } from '../../../friends/notifications.service';
import { DashboardStore, type ServerMemberWithProfile } from '../../services/dashboard.store';
import { PromptModalComponent } from '../prompt-modal/prompt-modal.component';
import { ProfilePopupComponent } from '../../../profile/profile-popup/profile-popup';
import { SettingsPopupComponent } from '../../../account-settings/settings-popup/settings-popup';

@Component({
  selector: 'app-dashboard-header',
  standalone: true,
  imports: [
    LobbyIconComponent,
    LogoComponent,
    ChatAvatarComponent,
    PromptModalComponent,
    ProfilePopupComponent,
    SettingsPopupComponent,
  ],
  templateUrl: './app-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class AppHeaderComponent {
  readonly activeServer = input<Server | null>(null);
  /** Emitted when the mobile hamburger button is clicked — the parent owns the drawer's open state. */
  readonly menuToggle = output<void>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly dashboardStore = inject(DashboardStore);
  private readonly profilePopup = inject(ProfilePopupService);
  private readonly settingsPopup = inject(SettingsPopupService);
  private readonly profileService = inject(ProfileService);
  private readonly friendsService = inject(FriendsService);
  private readonly toast = inject(ToastService);
  // Not read directly here — injecting forces these singletons to construct
  // (and start their realtime subscriptions) as soon as the dashboard shell
  // mounts, so a DM toast can fire from any page in /app.
  private readonly directMessages = inject(DirectMessagesService);
  private readonly notificationsService = inject(NotificationsService);
  protected readonly notificationsOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);
  protected readonly notifications = this.notificationsService.notifications;
  protected readonly notificationsLoading = this.notificationsService.loading;
  protected readonly unreadCount = this.notificationsService.unreadCount;

  protected readonly myProfile = signal<UserProfile | null>(null);
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  constructor() {
    // Reload once whenever both profile-editing surfaces are closed — this
    // covers the initial load and picks up an avatar/name change made in
    // either the profile popup or the settings popup's profile panel.
    effect(() => {
      const userId = this.currentUserId();
      const editingOpen = this.settingsPopup.isOpen() || this.profilePopup.userId() !== null;
      if (!userId) {
        this.myProfile.set(null);
      } else if (!editingOpen) {
        void this.loadMyProfile(userId);
      }
    });
  }

  private async loadMyProfile(userId: string): Promise<void> {
    try {
      this.myProfile.set(await this.profileService.getProfile(userId));
    } catch {
      // Avatar is decorative here — silently keep showing initials on failure.
    }
  }

  protected readonly displayName = computed(() => {
    // Prefer the customizable profile name (set via the profile panel) once
    // it's loaded; it can drift from the auth metadata name set at signup.
    const profileName = this.myProfile()?.displayName;
    if (profileName?.trim()) return profileName.trim();

    const user = this.auth.user();
    const metadataName = user?.userMetadata['name'];
    return typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : (user?.email ?? 'Account');
  });

  protected readonly isServerOwner = computed(
    () => this.activeServer()?.ownerId === this.currentUserId(),
  );
  protected readonly roster = computed(() => {
    const server = this.activeServer();
    return server ? this.dashboardStore.membersFor(server.id) : [];
  });

  protected readonly membersPanelOpen = signal(false);

  protected readonly addMemberOpen = signal(false);
  protected readonly memberQuery = signal('');
  protected readonly memberSearchResults = signal<UserProfile[]>([]);
  protected readonly memberSearching = signal(false);
  protected readonly memberActionError = signal<string | null>(null);
  protected readonly addingMemberId = signal<string | null>(null);
  protected readonly removingMemberId = signal<string | null>(null);
  private memberSearchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly renameModalOpen = signal(false);
  protected readonly renameSaving = signal(false);
  protected readonly renameError = signal<string | null>(null);
  protected readonly maxServerNameLength = MAX_SERVER_NAME_LENGTH;

  protected renameServer(): void {
    this.renameError.set(null);
    this.renameModalOpen.set(true);
  }

  protected cancelRenameServer(): void {
    if (this.renameSaving()) return;
    this.renameModalOpen.set(false);
    this.renameError.set(null);
  }

  protected async submitRenameServer(name: string): Promise<void> {
    const server = this.activeServer();
    if (!server || name === server.name) {
      this.renameModalOpen.set(false);
      return;
    }

    this.renameSaving.set(true);
    this.renameError.set(null);
    try {
      await this.dashboardStore.renameServer(server.id, name);
      this.renameModalOpen.set(false);
      this.toast.success(`Space renamed to "${name}"`);
    } catch {
      this.renameError.set('Could not rename the space. Please try again.');
    } finally {
      this.renameSaving.set(false);
    }
  }

  protected openMembersPanel(): void {
    const server = this.activeServer();
    if (server) void this.dashboardStore.loadMembers(server.id);
    this.membersPanelOpen.set(true);
  }

  protected closeMembersPanel(): void {
    this.membersPanelOpen.set(false);
    this.addMemberOpen.set(false);
    this.memberQuery.set('');
    this.memberSearchResults.set([]);
    this.memberActionError.set(null);
  }

  protected toggleAddMember(): void {
    this.addMemberOpen.update((open) => !open);
    this.memberActionError.set(null);
  }

  protected onMemberSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.memberQuery.set(value);
    if (this.memberSearchTimer) clearTimeout(this.memberSearchTimer);
    this.memberSearchTimer = setTimeout(() => void this.runMemberSearch(value), 300);
  }

  private async runMemberSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      this.memberSearchResults.set([]);
      this.memberSearching.set(false);
      return;
    }
    this.memberSearching.set(true);
    this.memberActionError.set(null);
    try {
      const results = await this.friendsService.searchUsers(trimmed);
      const memberIds = new Set(this.roster().map((member) => member.userId));
      this.memberSearchResults.set(results.filter((result) => !memberIds.has(result.userId)));
    } catch {
      this.memberSearchResults.set([]);
    } finally {
      this.memberSearching.set(false);
    }
  }

  protected async addMember(profile: UserProfile): Promise<void> {
    const server = this.activeServer();
    if (!server) return;

    this.addingMemberId.set(profile.userId);
    this.memberActionError.set(null);
    try {
      await this.dashboardStore.addMember(server.id, profile.userId);
      this.memberSearchResults.update((results) =>
        results.filter((result) => result.userId !== profile.userId),
      );
      this.toast.success(`${profile.displayName} added to ${server.name}`);
    } catch {
      this.memberActionError.set(`Could not add ${profile.displayName}.`);
    } finally {
      this.addingMemberId.set(null);
    }
  }

  protected async removeMember(member: ServerMemberWithProfile): Promise<void> {
    const server = this.activeServer();
    if (!server) return;

    this.removingMemberId.set(member.userId);
    try {
      await this.dashboardStore.removeMember(server.id, member.userId);
      this.toast.success(`${member.name} removed from ${server.name}`);
    } catch {
      this.toast.error(`Could not remove ${member.name}.`);
    } finally {
      this.removingMemberId.set(null);
    }
  }

  protected copyJoinLink(): void {
    const server = this.activeServer();
    if (!server) return;
    const link = `${window.location.origin}/app/join/${server.inviteCode}`;
    void navigator.clipboard.writeText(link).then(
      () => this.toast.success('Join link copied to clipboard'),
      () => this.toast.error('Could not copy the join link.'),
    );
  }

  protected notificationIcon(type: Notification['type']): LobbyIconName {
    switch (type) {
      case 'friend_request':
        return 'user-plus';
      case 'friend_accept':
        return 'check';
      case 'message':
        return 'chat';
      default:
        return 'bell';
    }
  }

  protected notificationTime(createdAt: string): string {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  protected markNotificationsRead(): void {
    void this.notificationsService.markAllRead();
  }

  protected openNotification(notification: Notification): void {
    this.notificationsOpen.set(false);
    if (notification.type === 'friend_request') {
      // Jump straight to the pending tab so the request can be acted on.
      void this.router.navigate(['/app/friends'], { queryParams: { tab: 'pending' } });
    } else if (notification.type === 'friend_accept') {
      void this.router.navigate(['/app/friends']);
    } else if (notification.type === 'message') {
      void this.router.navigate(['/app/messages']);
    }
  }

  protected openMyProfile(): void {
    this.accountMenuOpen.set(false);
    const userId = this.currentUserId();
    if (userId) this.profilePopup.open(userId);
  }

  protected openSettings(): void {
    this.accountMenuOpen.set(false);
    this.settingsPopup.open('profile');
  }

  protected toggleNotifications(): void {
    this.accountMenuOpen.set(false);
    this.notificationsOpen.update((value) => !value);
    if (this.notificationsOpen()) {
      // Opening the panel is the user acknowledging the items — mark them read.
      void this.notificationsService.markAllRead();
    }
  }

  protected toggleAccountMenu(): void {
    this.notificationsOpen.set(false);
    this.accountMenuOpen.update((value) => !value);
  }

  protected async logout(): Promise<void> {
    this.accountMenuOpen.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.notificationsOpen() && !this.accountMenuOpen()) return;
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.notificationsOpen.set(false);
      this.accountMenuOpen.set(false);
    }
  }
}

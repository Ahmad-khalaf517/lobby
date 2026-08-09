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
import { MAX_SERVER_NAME_LENGTH, type Server, type UserProfile } from '@lobby/shared';

import { AuthService } from '../../../auth/services/auth';
import { ChatAvatarComponent } from '../../../../shared/components/room-chat';
import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { LogoComponent } from '../../../../shared/ui/logo/lobby-logo.component';
import { ToastService } from '../../../../core/toast/toast.service';
import { ProfilePopupService } from '../../../profile/services/profile-popup.service';
import { ProfileService } from '../../../profile/services/profile.service';
import { SettingsPopupService } from '../../../account-settings/services/settings-popup.service';
import { DirectMessagesService } from '../../../messages/messages.service';
import { NotificationsService } from '../../../friends/notifications.service';
import { DashboardStore } from '../../services/dashboard.store';
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
  private readonly toast = inject(ToastService);
  // Not read directly here — injecting forces these singletons to construct
  // (and start their realtime subscriptions) as soon as the dashboard shell
  // mounts, so a DM/friend-request toast can fire from any page in /app.
  private readonly directMessages = inject(DirectMessagesService);
  private readonly notificationsRealtime = inject(NotificationsService);
  protected readonly notificationsOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);

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

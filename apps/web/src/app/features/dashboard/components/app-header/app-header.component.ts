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
import { Router, RouterLink } from '@angular/router';
import { MAX_SERVER_NAME_LENGTH, type Server } from '@lobby/shared';

import { AuthService } from '../../../auth/services/auth';
import { ChatAvatarComponent } from '../../../../shared/components/room-chat';
import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { LogoComponent } from '../../../../shared/ui/logo/lobby-logo.component';
import { DashboardStore } from '../../services/dashboard.store';
import { PromptModalComponent } from '../prompt-modal/prompt-modal.component';

@Component({
  selector: 'app-dashboard-header',
  standalone: true,
  imports: [
    RouterLink,
    LobbyIconComponent,
    LogoComponent,
    ChatAvatarComponent,
    PromptModalComponent,
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
  protected readonly notificationsOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);

  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    const metadataName = user?.userMetadata['name'];
    return typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : (user?.email ?? 'Account');
  });

  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
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
    } catch {
      this.renameError.set('Could not rename the space. Please try again.');
    } finally {
      this.renameSaving.set(false);
    }
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

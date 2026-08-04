import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { User } from '@supabase/supabase-js';

import { AuthService } from '../../auth/services/auth';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-landing-navbar',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './landing-navbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingNavbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly profileButton = viewChild<ElementRef<HTMLButtonElement>>('profileButton');

  protected readonly user = signal<User | null>(null);
  protected readonly dropdownOpen = signal(false);
  protected readonly isLoggingOut = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  protected readonly displayName = computed(() => {
    const user = this.user();
    const metadataName = user?.user_metadata['name'];
    const metadataFullName = user?.user_metadata['full_name'];

    if (typeof metadataName === 'string' && metadataName.trim()) {
      return metadataName.trim();
    }

    if (typeof metadataFullName === 'string' && metadataFullName.trim()) {
      return metadataFullName.trim();
    }

    return user?.email ?? 'Lobby member';
  });

  protected readonly secondaryLabel = computed(() => {
    const email = this.user()?.email;
    return email && email !== this.displayName() ? email : null;
  });

  protected readonly avatarInitial = computed(() =>
    this.displayName().charAt(0).toLocaleUpperCase(),
  );

  constructor() {
    afterNextRender(() => {
      const subscription = this.auth.onAuthStateChange((session) => {
        this.user.set(session?.user ?? null);

        if (!session) {
          this.closeDropdown();
        }
      });

      this.destroyRef.onDestroy(() => subscription.unsubscribe());
      void this.loadSession();
    });
  }

  protected toggleDropdown(): void {
    this.logoutError.set(null);
    this.dropdownOpen.update((open) => !open);
  }

  protected closeDropdown(): void {
    this.dropdownOpen.set(false);
    this.logoutError.set(null);
  }

  protected async logout(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.isLoggingOut.set(true);
    this.logoutError.set(null);

    try {
      const { error } = await this.auth.logout();

      if (error) {
        this.logoutError.set('We could not sign you out. Please try again.');
        return;
      }

      this.user.set(null);
      this.closeDropdown();
      await this.router.navigateByUrl('/');
    } catch {
      this.logoutError.set('We could not sign you out. Please try again.');
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.dropdownOpen()) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (!this.dropdownOpen()) {
      return;
    }

    this.closeDropdown();
    this.profileButton()?.nativeElement.focus();
  }

  private async loadSession(): Promise<void> {
    try {
      const { data, error } = await this.auth.getSession();
      this.user.set(error ? null : (data.session?.user ?? null));
    } catch {
      this.user.set(null);
    }
  }
}

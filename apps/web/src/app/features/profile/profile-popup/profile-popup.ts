import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MAX_NAME_LENGTH, MAX_PROFILE_BIO_LENGTH, UserProfile } from '@lobby/shared';
import { AuthService } from '../../auth/services/auth';
import { ProfilePopupService } from '../services/profile-popup.service';
import { ProfileService } from '../services/profile.service';

type PopupMode = 'view' | 'edit';

@Component({
  selector: 'app-profile-popup',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-popup.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePopupComponent {
  private readonly popup = inject(ProfilePopupService);
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);

  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  protected readonly userId = this.popup.userId;
  protected readonly isOpen = computed(() => this.userId() !== null);
  protected readonly isOwnProfile = computed(
    () => this.userId() !== null && this.userId() === this.auth.user()?.id,
  );

  protected readonly mode = signal<PopupMode>('view');
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly displayNameInput = signal('');
  protected readonly bioInput = signal('');

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxBioLength = MAX_PROFILE_BIO_LENGTH;
  protected readonly bioCharCount = computed(() => this.bioInput().length);

  protected readonly initials = computed(() => this.initialsFor(this.profile()?.displayName ?? ''));

  constructor() {
    // Load fresh profile data every time the popup opens for a (possibly new) user.
    effect(() => {
      const id = this.userId();
      if (id) {
        this.mode.set('view');
        void this.loadProfile(id);
      } else {
        this.profile.set(null);
        this.errorMessage.set(null);
      }
    });
  }

  protected close(): void {
    if (this.saving() || this.uploadingAvatar()) return;
    this.popup.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected enterEditMode(): void {
    const current = this.profile();
    if (!current) return;
    this.displayNameInput.set(current.displayName);
    this.bioInput.set(current.bio ?? '');
    this.errorMessage.set(null);
    this.mode.set('edit');
  }

  protected cancelEdit(): void {
    this.errorMessage.set(null);
    this.mode.set('view');
  }

  protected onBioInput(value: string): void {
    this.bioInput.set(value.slice(0, this.maxBioLength));
  }

  protected triggerAvatarPicker(): void {
    this.avatarInput()?.nativeElement.click();
  }

  protected async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const id = this.userId();
    if (!id) return;

    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.uploadAvatar(id, file);
      this.profile.set(updated);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not upload that image.'));
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  protected async removeAvatar(): Promise<void> {
    const id = this.userId();
    if (!id) return;

    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.deleteAvatar(id);
      this.profile.set(updated);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not remove the avatar.'));
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  protected async save(): Promise<void> {
    const id = this.userId();
    if (!id || this.saving()) return;

    const displayName = this.displayNameInput().trim();
    if (!displayName) {
      this.errorMessage.set('Display name is required.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.updateProfile(id, {
        displayName,
        bio: this.bioInput().trim().length > 0 ? this.bioInput().trim() : null,
      });
      this.profile.set(updated);
      this.mode.set('view');
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not save your changes.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadProfile(userId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const profile = await this.profileService.getProfile(userId);
      this.profile.set(profile);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not load this profile.'));
    } finally {
      this.loading.set(false);
    }
  }

  private initialsFor(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  private messageFor(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}

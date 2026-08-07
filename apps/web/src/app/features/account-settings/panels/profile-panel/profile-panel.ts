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
import { AuthService } from '../../../auth/services/auth';
import { ProfileService } from '../../../profile/services/profile.service';
import { SettingsPopupService } from '../../services/settings-popup.service';

@Component({
  selector: 'app-profile-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePanelComponent {
  private readonly popup = inject(SettingsPopupService);
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);

  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savedJustNow = signal(false);

  protected readonly displayNameInput = signal('');
  protected readonly usernameInput = signal('');
  protected readonly bioInput = signal('');

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxUserNameLength = MAX_NAME_LENGTH;
  protected readonly maxBioLength = MAX_PROFILE_BIO_LENGTH;
  protected readonly bioCharCount = computed(() => this.bioInput().length);

  protected readonly initials = computed(() => this.initialsFor(this.profile()?.displayName ?? ''));

  protected readonly isDirty = computed(() => {
    const current = this.profile();
    if (!current) return false;
    return (
      this.displayNameInput() !== current.displayName ||
      this.usernameInput() !== current.username ||
      this.bioInput() !== (current.bio ?? '')
    );
  });

  constructor() {
    // Load fresh profile data every time this panel becomes visible.
    effect(() => {
      if (this.popup.isOpen() && this.popup.section() === 'profile') {
        void this.loadProfile();
      }
    });
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

    const userId = this.auth.user()?.id;
    if (!userId) return;

    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.uploadAvatar(userId, file);
      this.profile.set(updated);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not upload that image.'));
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  protected async removeAvatar(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.deleteAvatar(userId);
      this.profile.set(updated);
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not remove the avatar.'));
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  protected async save(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || this.saving()) return;

    const displayName = this.displayNameInput().trim();
    if (!displayName) {
      this.errorMessage.set('Display name is required.');
      return;
    }
    const username = this.usernameInput().trim();
    if (!username) {
      this.errorMessage.set('Username is required.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.profileService.updateProfile(userId, {
        displayName,
        userName: username,
        bio: this.bioInput().trim().length > 0 ? this.bioInput().trim() : null,
      });
      this.profile.set(updated);
      this.displayNameInput.set(updated.displayName);
      this.usernameInput.set(updated.username);
      this.bioInput.set(updated.bio ?? '');
      this.flashSaved();
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not save your changes.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const profile = await this.profileService.getProfile(userId);
      this.profile.set(profile);
      this.displayNameInput.set(profile.displayName);
      this.usernameInput.set(profile.username);
      this.bioInput.set(profile.bio ?? '');
    } catch (error) {
      this.errorMessage.set(this.messageFor(error, 'Could not load your profile.'));
    } finally {
      this.loading.set(false);
    }
  }

  private flashSaved(): void {
    this.savedJustNow.set(true);
    setTimeout(() => this.savedJustNow.set(false), 2000);
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

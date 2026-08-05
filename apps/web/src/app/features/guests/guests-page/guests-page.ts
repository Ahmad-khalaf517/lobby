import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MAX_CHANNEL_NAME_LENGTH, MAX_NAME_LENGTH } from '@lobby/shared';

import { AuthService } from '../../auth/services/auth';
import { GuestChannelStore } from '../../guest-room/services/guest-channel.store';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

@Component({
  selector: 'app-guests-page',
  imports: [ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './guests-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestsPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guest = inject(GuestChannelStore);

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxChannelNameLength = MAX_CHANNEL_NAME_LENGTH;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly requiresDisplayName = computed(() => this.auth.status() !== 'authenticated');

  protected readonly identityForm = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_NAME_LENGTH)],
    }),
  });

  protected readonly joinForm = new FormGroup({
    inviteCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly createForm = new FormGroup({
    channelName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(MAX_CHANNEL_NAME_LENGTH)],
    }),
  });

  constructor() {
    void this.auth.initialize();
  }

  protected async joinChannel(): Promise<void> {
    if (!this.identityValid() || this.joinForm.invalid) {
      this.identityForm.markAllAsTouched();
      this.joinForm.markAllAsTouched();
      return;
    }

    await this.run(async () => {
      const code = this.joinForm.controls.inviteCode.value.trim().toUpperCase();
      await this.guest.join(code, this.displayName());
      await this.router.navigate(['/guest', code]);
    });
  }

  protected async createChannel(): Promise<void> {
    if (!this.identityValid() || this.createForm.invalid) {
      this.identityForm.markAllAsTouched();
      this.createForm.markAllAsTouched();
      return;
    }

    await this.run(async () => {
      const result = await this.guest.create(
        this.createForm.controls.channelName.value,
        this.displayName(),
      );
      await this.router.navigate(['/guest', result.code]);
    });
  }

  private identityValid(): boolean {
    return !this.requiresDisplayName() || Boolean(this.displayName());
  }

  private displayName(): string | undefined {
    const value = this.identityForm.controls.displayName.value.trim();
    return value || undefined;
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await operation();
    } catch (error: unknown) {
      this.errorMessage.set(describeError(error));
    } finally {
      this.submitting.set(false);
    }
  }
}

function describeError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'The guest channel request failed. Please try again.';
}

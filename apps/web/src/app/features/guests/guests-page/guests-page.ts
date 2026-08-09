import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  DEFAULT_CALL_PARTICIPANTS,
  DEFAULT_GUEST_ROOM_LIFETIME_MINUTES,
  GuestChannelCreateRequestSchema,
  MAX_CALL_PARTICIPANTS,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MIN_CALL_PARTICIPANTS,
  type GuestChannelCreateRequest,
} from '@lobby/shared';
import type { ZodType } from 'zod';

import { LobbyIconComponent } from '../../../shared/ui/icon/lobby-icon.component';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';
import { LobbySelectComponent } from '../../../shared/ui/select/lobby-select.component';
import {
  guestChannelNameSchema,
  guestDisplayNameSchema,
  guestInviteCodeSchema,
} from '../../../shared/validation/guest-channel.schema';
import { AuthService } from '../../auth/services/auth';
import { GuestChannelStore } from '../../guest-room/services/guest-channel.store';

type GuestIdentityState = 'loading' | 'registered' | 'guest';
type GuestField = 'displayName' | 'inviteCode' | 'channelName';
type GuestOperation = 'join' | 'create';

@Component({
  selector: 'app-guests-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LogoComponent,
    LobbyIconComponent,
    LobbySelectComponent,
  ],
  templateUrl: './guests-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestsPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guest = inject(GuestChannelStore);

  private readonly displayNameInput = viewChild<ElementRef<HTMLInputElement>>('displayNameInput');
  private readonly inviteCodeInput =
    viewChild.required<ElementRef<HTMLInputElement>>('inviteCodeInput');
  private readonly channelNameInput =
    viewChild.required<ElementRef<HTMLInputElement>>('channelNameInput');

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxChannelNameLength = MAX_CHANNEL_NAME_LENGTH;
  protected readonly minCallParticipants = MIN_CALL_PARTICIPANTS;
  protected readonly maxCallParticipants = MAX_CALL_PARTICIPANTS;
  protected readonly lifetimeOptions = [
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 180, label: '3 hours' },
  ] as const;
  protected readonly submittingOperation = signal<GuestOperation | null>(null);
  protected readonly submitting = computed(() => this.submittingOperation() !== null);
  protected readonly joinSubmitted = signal(false);
  protected readonly createSubmitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly configurationError = signal<string | null>(null);

  protected readonly identityState = computed<GuestIdentityState>(() => {
    switch (this.auth.status()) {
      case 'initializing':
        return 'loading';
      case 'authenticated':
        return 'registered';
      default:
        return 'guest';
    }
  });
  protected readonly authLoading = computed(() => this.identityState() === 'loading');
  protected readonly requiresDisplayName = computed(() => this.identityState() === 'guest');

  protected readonly identityForm = new FormGroup({
    displayName: new FormControl('', { nonNullable: true }),
  });

  protected readonly joinForm = new FormGroup({
    inviteCode: new FormControl('', { nonNullable: true }),
  });

  protected readonly createForm = new FormGroup({
    channelName: new FormControl('', { nonNullable: true }),
    maxParticipants: new FormControl(DEFAULT_CALL_PARTICIPANTS, { nonNullable: true }),
    lifetimeMinutes: new FormControl(DEFAULT_GUEST_ROOM_LIFETIME_MINUTES, { nonNullable: true }),
  });

  constructor() {
    void this.auth.initialize();
  }

  protected fieldError(field: GuestField): string | null {
    const control = this.control(field);
    const error = control.errors?.['zod'] ?? control.errors?.['server'];
    const submitted =
      field === 'displayName'
        ? this.joinSubmitted() || this.createSubmitted()
        : field === 'inviteCode'
          ? this.joinSubmitted()
          : this.createSubmitted();
    const shouldShow = control.touched || control.dirty || submitted;

    return shouldShow && typeof error === 'string' ? error : null;
  }

  protected validateField(field: GuestField): void {
    this.validateSingleField(field);
  }

  protected handleFieldInput(field: GuestField): void {
    this.errorMessage.set(null);
    this.validateSingleField(field);
  }

  protected async joinChannel(): Promise<void> {
    if (this.submitting() || this.authLoading()) {
      return;
    }

    this.joinSubmitted.set(true);
    this.errorMessage.set(null);

    const displayName = this.validateDisplayName();
    const inviteCode = this.validateValue(
      'inviteCode',
      this.joinForm.controls.inviteCode.value,
      guestInviteCodeSchema,
    );

    if (displayName === null || inviteCode === null) {
      this.focusFirstInvalidField('join');
      return;
    }

    await this.run('join', async () => {
      await this.guest.join(inviteCode, displayName);
      await this.router.navigate(['/guest', inviteCode]);
    });
  }

  protected async createChannel(): Promise<void> {
    if (this.submitting() || this.authLoading()) {
      return;
    }

    this.createSubmitted.set(true);
    this.errorMessage.set(null);
    this.configurationError.set(null);

    const displayName = this.validateDisplayName();
    const channelName = this.validateValue(
      'channelName',
      this.createForm.controls.channelName.value,
      guestChannelNameSchema,
    );
    const configuration =
      this.identityState() === 'registered' && channelName !== null
        ? this.validateConfiguration(channelName)
        : undefined;

    if (
      displayName === null ||
      channelName === null ||
      (this.identityState() === 'registered' && !configuration)
    ) {
      this.focusFirstInvalidField('create');
      return;
    }

    await this.run('create', async () => {
      const result = await this.guest.create(channelName, displayName, configuration ?? undefined);
      await this.router.navigate(['/guest', result.code], { state: { shareRoom: true } });
    });
  }

  protected handleConfigurationInput(): void {
    this.errorMessage.set(null);
    this.configurationError.set(null);
  }

  private validateDisplayName(): string | undefined | null {
    if (!this.requiresDisplayName()) {
      this.identityForm.controls.displayName.setErrors(null);
      return undefined;
    }

    return this.validateValue(
      'displayName',
      this.identityForm.controls.displayName.value,
      guestDisplayNameSchema,
    );
  }

  private validateSingleField(field: GuestField): void {
    switch (field) {
      case 'displayName':
        this.validateDisplayName();
        break;
      case 'inviteCode':
        this.validateValue(field, this.joinForm.controls.inviteCode.value, guestInviteCodeSchema);
        break;
      case 'channelName':
        this.validateValue(
          field,
          this.createForm.controls.channelName.value,
          guestChannelNameSchema,
        );
        break;
    }
  }

  private validateConfiguration(name: string): GuestChannelCreateRequest | null {
    const result = GuestChannelCreateRequestSchema.safeParse({
      name,
      maxParticipants: this.createForm.controls.maxParticipants.value,
      lifetimeMinutes: this.createForm.controls.lifetimeMinutes.value,
    });

    if (result.success) return result.data;

    this.configurationError.set(
      result.error.issues[0]?.message ?? 'The room configuration is invalid.',
    );
    return null;
  }

  private validateValue<TOutput>(
    field: GuestField,
    value: string,
    schema: ZodType<TOutput>,
  ): TOutput | null {
    const control = this.control(field);
    control.setErrors(null);

    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    control.setErrors({ zod: result.error.issues[0]?.message ?? 'This value is invalid.' });
    return null;
  }

  private control(field: GuestField): FormControl<string> {
    switch (field) {
      case 'displayName':
        return this.identityForm.controls.displayName;
      case 'inviteCode':
        return this.joinForm.controls.inviteCode;
      case 'channelName':
        return this.createForm.controls.channelName;
    }
  }

  private focusFirstInvalidField(operation: GuestOperation): void {
    if (this.requiresDisplayName() && this.identityForm.controls.displayName.invalid) {
      this.displayNameInput()?.nativeElement.focus();
      return;
    }

    if (operation === 'join' && this.joinForm.controls.inviteCode.invalid) {
      this.inviteCodeInput().nativeElement.focus();
    } else if (operation === 'create' && this.createForm.controls.channelName.invalid) {
      this.channelNameInput().nativeElement.focus();
    }
  }

  private async run(operation: GuestOperation, callback: () => Promise<void>): Promise<void> {
    this.submittingOperation.set(operation);
    this.errorMessage.set(null);

    try {
      await callback();
    } catch (error: unknown) {
      const message = describeError(error);
      if (!this.applyFieldError(operation, message)) {
        this.errorMessage.set(message);
      }
    } finally {
      this.submittingOperation.set(null);
    }
  }

  private applyFieldError(operation: GuestOperation, message: string): boolean {
    const normalized = message.toLowerCase();
    let field: GuestField | null = null;

    if (/display[ _-]?name|guest name/.test(normalized)) {
      field = 'displayName';
    } else if (operation === 'join' && /invite|channel code|\bcode\b/.test(normalized)) {
      field = 'inviteCode';
    } else if (operation === 'create' && /channel name|room name|\bname\b/.test(normalized)) {
      field = 'channelName';
    }

    if (!field) {
      return false;
    }

    const control = this.control(field);
    control.setErrors({ ...control.errors, server: message });
    queueMicrotask(() => this.focusFirstInvalidField(operation));
    return true;
  }
}

function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const nestedMessage = readMessage(Reflect.get(error, 'error'));
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  const directMessage = readMessage(error);
  return directMessage || 'The guest channel request failed. Please try again.';
}

function readMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const message = Reflect.get(value, 'message');
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string').join(' ');
  }

  return typeof message === 'string' ? message : '';
}

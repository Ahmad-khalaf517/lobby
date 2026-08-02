import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { resetPasswordSchema, ResetPasswordInput } from '../../schemas/reset-password.schema';
import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';
import { mapZodFieldErrors } from '../../utils/zod-form-errors.util';

export type ResetPasswordState =
  'verifying' | 'ready' | 'submitting' | 'success' | 'failure' | 'missing';

interface RecoveryCallbackSnapshot {
  readonly errorCode: string;
  readonly errorDescription: string;
  readonly hasAuthorizationCode: boolean;
  readonly hasImplicitTokens: boolean;
  readonly type: string;
}

const resetPasswordFields = [
  'password',
  'confirmPassword',
] as const satisfies readonly (keyof ResetPasswordInput)[];
type ResetPasswordField = (typeof resetPasswordFields)[number];

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly callbackSnapshot = this.captureCallback();
  private readonly auth = inject(AuthService);

  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly confirmPasswordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('confirmPasswordInput');
  private readonly errorAlert = viewChild<ElementRef<HTMLDivElement>>('errorAlert');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: '',
    confirmPassword: '',
  });

  protected readonly state = signal<ResetPasswordState>('verifying');
  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly submitted = signal(false);
  protected readonly generalError = signal<string | null>(null);
  protected readonly failureMessage = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.verifyRecoverySession());
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.confirmPasswordVisible.update((visible) => !visible);
  }

  protected validateField(): void {
    this.validateForm();
  }

  protected handleFieldInput(): void {
    this.generalError.set(null);
    this.validateForm();
  }

  protected fieldError(field: ResetPasswordField): string | null {
    const control = this.form.controls[field];
    const error = control.errors?.['zod'];
    const shouldShow = control.touched || control.dirty || this.submitted();

    return shouldShow && typeof error === 'string' ? error : null;
  }

  protected async submit(): Promise<void> {
    if (this.state() !== 'ready') {
      return;
    }

    this.submitted.set(true);
    this.generalError.set(null);
    const input = this.validateForm();

    if (!input) {
      this.focusFirstInvalidField();
      return;
    }

    this.state.set('submitting');
    this.form.disable({ emitEvent: false });

    try {
      const { error } = await this.auth.updatePassword(input.password);

      if (error) {
        throw error;
      }

      this.form.reset({ password: '', confirmPassword: '' });
      await this.auth.logout();
      this.state.set('success');
    } catch (error: unknown) {
      this.generalError.set(getAuthErrorMessage(error, 'password-update'));
      this.state.set('ready');
      queueMicrotask(() => this.errorAlert()?.nativeElement.focus());
    } finally {
      if (this.state() !== 'success') {
        this.form.enable({ emitEvent: false });
      }
    }
  }

  private async verifyRecoverySession(): Promise<void> {
    const callback = this.callbackSnapshot ?? this.captureCallback();

    if (!callback) {
      this.state.set('missing');
      return;
    }

    if (callback.errorCode || callback.errorDescription) {
      this.failureMessage.set(
        getAuthErrorMessage(
          { code: callback.errorCode, message: callback.errorDescription },
          'password-recovery',
        ),
      );
      this.state.set('failure');
      return;
    }

    const hasCallbackInformation =
      callback.type !== '' || callback.hasImplicitTokens || callback.hasAuthorizationCode;

    if (!hasCallbackInformation) {
      this.state.set('missing');
      return;
    }

    if (callback.type !== 'recovery' || !callback.hasImplicitTokens) {
      this.failureMessage.set(
        'This password reset link is invalid or incomplete. Request a new recovery email and try again.',
      );
      this.state.set('failure');
      return;
    }

    try {
      const { data, error } = await this.auth.getSession();

      if (error) {
        throw error;
      }

      if (!data.session) {
        this.failureMessage.set(
          'This password reset link may be invalid or expired. Request a new recovery email and try again.',
        );
        this.state.set('failure');
        return;
      }

      this.state.set('ready');
    } catch (error: unknown) {
      this.failureMessage.set(getAuthErrorMessage(error, 'password-recovery'));
      this.state.set('failure');
    }
  }

  private validateForm(): ResetPasswordInput | null {
    for (const field of resetPasswordFields) {
      this.form.controls[field].setErrors(null);
    }

    const result = resetPasswordSchema.safeParse(this.form.getRawValue());

    if (result.success) {
      return result.data;
    }

    const errors = mapZodFieldErrors(result.error, resetPasswordFields);
    for (const field of resetPasswordFields) {
      const message = errors[field];
      if (message) {
        this.form.controls[field].setErrors({ zod: message });
      }
    }

    return null;
  }

  private focusFirstInvalidField(): void {
    const field = resetPasswordFields.find((candidate) => this.form.controls[candidate].invalid);

    if (field === 'password') {
      this.passwordInput().nativeElement.focus();
    } else if (field === 'confirmPassword') {
      this.confirmPasswordInput().nativeElement.focus();
    }
  }

  private captureCallback(): RecoveryCallbackSnapshot | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const search = new URLSearchParams(this.document.location.search);
    const hash = new URLSearchParams(this.document.location.hash.replace(/^#/, ''));

    return {
      errorCode: search.get('error_code') ?? hash.get('error_code') ?? search.get('error') ?? '',
      errorDescription:
        search.get('error_description') ?? hash.get('error_description') ?? hash.get('error') ?? '',
      hasAuthorizationCode: search.has('code'),
      hasImplicitTokens: hash.has('access_token') && hash.has('refresh_token'),
      type: hash.get('type') ?? search.get('type') ?? '',
    };
  }
}

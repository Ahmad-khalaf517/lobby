import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { resetPasswordSchema, ResetPasswordInput } from '../../schemas/reset-password.schema';
import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';
import { mapZodFieldErrors } from '../../utils/zod-form-errors.util';

export type ResetPasswordState =
  'verifying' | 'ready' | 'submitting' | 'success' | 'failure' | 'missing';

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
  private readonly route = inject(ActivatedRoute);
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
      await this.auth.resetPassword(input.password, input.confirmPassword);
      this.form.reset({ password: '', confirmPassword: '' });
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
    const params = this.route.snapshot.queryParamMap;
    const errorCode = params.get('error_code') ?? params.get('error') ?? '';
    const errorDescription = params.get('error_description') ?? '';
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    if (errorCode || errorDescription) {
      this.failureMessage.set(
        getAuthErrorMessage({ code: errorCode, message: errorDescription }, 'password-recovery'),
      );
      this.state.set('failure');
      return;
    }

    if (!tokenHash && !type) {
      this.state.set('missing');
      return;
    }

    if (!tokenHash || type !== 'recovery') {
      this.failureMessage.set(
        'This password reset link is invalid or incomplete. Request a new recovery email and try again.',
      );
      this.state.set('failure');
      return;
    }

    try {
      await this.auth.verifyRecovery(tokenHash);
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
}

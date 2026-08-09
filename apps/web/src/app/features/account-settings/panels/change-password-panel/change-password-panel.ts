import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ChangePasswordRequestSchema, type ChangePasswordRequest } from '@lobby/shared';

import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { getAuthErrorMessage } from '../../../auth/utils/auth-error.util';
import { mapZodFieldErrors } from '../../../auth/utils/zod-form-errors.util';
import { AuthService } from '../../../auth/services/auth';

const changePasswordFields = [
  'currentPassword',
  'password',
  'confirmPassword',
] as const satisfies readonly (keyof ChangePasswordRequest)[];
type ChangePasswordField = (typeof changePasswordFields)[number];

@Component({
  selector: 'app-change-password-panel',
  standalone: true,
  imports: [ReactiveFormsModule, LobbyIconComponent],
  templateUrl: './change-password-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordPanelComponent {
  private readonly auth = inject(AuthService);

  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly currentPasswordInput =
    viewChild<ElementRef<HTMLInputElement>>('currentPasswordInput');
  private readonly confirmPasswordInput =
    viewChild<ElementRef<HTMLInputElement>>('confirmPasswordInput');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });

  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly generalError = signal<string | null>(null);

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

  protected fieldError(field: ChangePasswordField): string | null {
    const control = this.form.controls[field];
    const error = control.errors?.['zod'];
    const shouldShow = control.touched || control.dirty || this.submitted();

    return shouldShow && typeof error === 'string' ? error : null;
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;

    this.submitted.set(true);
    this.generalError.set(null);
    const input = this.validateForm();

    if (!input) {
      this.focusFirstInvalidField();
      return;
    }

    this.saving.set(true);
    this.form.disable({ emitEvent: false });

    try {
      await this.auth.changePassword(input.currentPassword, input.password, input.confirmPassword);
      this.form.reset({ currentPassword: '', password: '', confirmPassword: '' });
      this.submitted.set(false);
    } catch (error: unknown) {
      const message = getAuthErrorMessage(error, 'password-update');
      this.generalError.set(message);
    } finally {
      this.saving.set(false);
      this.form.enable({ emitEvent: false });
    }
  }

  private validateForm(): ChangePasswordRequest | null {
    for (const field of changePasswordFields) {
      this.form.controls[field].setErrors(null);
    }

    const result = ChangePasswordRequestSchema.safeParse(this.form.getRawValue());

    if (result.success) {
      return result.data;
    }

    const errors = mapZodFieldErrors(result.error, changePasswordFields);
    for (const field of changePasswordFields) {
      const message = errors[field];
      if (message) {
        this.form.controls[field].setErrors({ zod: message });
      }
    }

    return null;
  }

  private focusFirstInvalidField(): void {
    const field = changePasswordFields.find((candidate) => this.form.controls[candidate].invalid);

    if (field === 'currentPassword') {
      this.currentPasswordInput()?.nativeElement.focus();
    } else if (field === 'password') {
      this.passwordInput()?.nativeElement.focus();
    } else if (field === 'confirmPassword') {
      this.confirmPasswordInput()?.nativeElement.focus();
    }
  }
}

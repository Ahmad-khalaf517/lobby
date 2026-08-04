import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { forgotPasswordSchema, ForgotPasswordInput } from '../../schemas/forgot-password.schema';
import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';
import { mapZodFieldErrors } from '../../utils/zod-form-errors.util';

const forgotPasswordFields = ['email'] as const satisfies readonly (keyof ForgotPasswordInput)[];
type ForgotPasswordField = (typeof forgotPasswordFields)[number];

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');
  private readonly errorAlert = viewChild<ElementRef<HTMLDivElement>>('errorAlert');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: '',
  });

  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly requestSent = signal(false);
  protected readonly generalError = signal<string | null>(null);

  protected validateField(): void {
    this.validateForm();
  }

  protected handleFieldInput(): void {
    this.generalError.set(null);
    this.validateForm();
  }

  protected fieldError(field: ForgotPasswordField): string | null {
    const control = this.form.controls[field];
    const error = control.errors?.['zod'];
    const shouldShow = control.touched || control.dirty || this.submitted();

    return shouldShow && typeof error === 'string' ? error : null;
  }

  protected async submit(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.submitted.set(true);
    this.generalError.set(null);
    const input = this.validateForm();

    if (!input) {
      this.emailInput().nativeElement.focus();
      return;
    }

    this.isSubmitting.set(true);

    try {
      await this.auth.forgotPassword(input.email);

      this.form.reset({ email: '' });
      this.requestSent.set(true);
    } catch (error: unknown) {
      this.generalError.set(getAuthErrorMessage(error, 'password-recovery'));
      queueMicrotask(() => this.errorAlert()?.nativeElement.focus());
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private validateForm(): ForgotPasswordInput | null {
    for (const field of forgotPasswordFields) {
      this.form.controls[field].setErrors(null);
    }

    const result = forgotPasswordSchema.safeParse(this.form.getRawValue());

    if (result.success) {
      return result.data;
    }

    const errors = mapZodFieldErrors(result.error, forgotPasswordFields);
    for (const field of forgotPasswordFields) {
      const message = errors[field];
      if (message) {
        this.form.controls[field].setErrors({ zod: message });
      }
    }

    return null;
  }
}

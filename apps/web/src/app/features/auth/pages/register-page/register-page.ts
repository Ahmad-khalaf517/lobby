import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { registerSchema, RegisterInput } from '../../schemas/register.schema';
import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';
import { mapZodFieldErrors } from '../../utils/zod-form-errors.util';

const registerFields = [
  'name',
  'email',
  'password',
  'confirmPassword',
] as const satisfies readonly (keyof RegisterInput)[];
type RegisterField = (typeof registerFields)[number];

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly confirmPasswordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('confirmPasswordInput');
  private readonly errorAlert = viewChild<ElementRef<HTMLDivElement>>('errorAlert');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly generalError = signal<string | null>(null);
  protected readonly confirmationEmail = signal<string | null>(null);

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

  protected fieldError(field: RegisterField): string | null {
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
      this.focusFirstInvalidField();
      return;
    }

    this.isSubmitting.set(true);

    try {
      const result = await this.auth.register(input);

      if (result.user) {
        await this.router.navigateByUrl('/app');
        return;
      }

      this.confirmationEmail.set(input.email);
    } catch (error: unknown) {
      this.generalError.set(getAuthErrorMessage(error, 'register'));
      queueMicrotask(() => this.errorAlert()?.nativeElement.focus());
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private validateForm(): RegisterInput | null {
    for (const field of registerFields) {
      this.form.controls[field].setErrors(null);
    }

    const result = registerSchema.safeParse(this.form.getRawValue());

    if (result.success) {
      return result.data;
    }

    const errors = mapZodFieldErrors(result.error, registerFields);
    for (const field of registerFields) {
      const message = errors[field];
      if (message) {
        this.form.controls[field].setErrors({ zod: message });
      }
    }

    return null;
  }

  private focusFirstInvalidField(): void {
    const field = registerFields.find((candidate) => this.form.controls[candidate].invalid);

    if (field === 'name') {
      this.nameInput().nativeElement.focus();
    } else if (field === 'email') {
      this.emailInput().nativeElement.focus();
    } else if (field === 'password') {
      this.passwordInput().nativeElement.focus();
    } else if (field === 'confirmPassword') {
      this.confirmPasswordInput().nativeElement.focus();
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { loginSchema, LoginInput } from '../../schemas/login.schema';
import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';
import { mapZodFieldErrors } from '../../utils/zod-form-errors.util';

const loginFields = ['email', 'password'] as const satisfies readonly (keyof LoginInput)[];
type LoginField = (typeof loginFields)[number];

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly errorAlert = viewChild<ElementRef<HTMLDivElement>>('errorAlert');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: '',
    password: '',
  });

  protected readonly passwordVisible = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly generalError = signal<string | null>(null);

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected validateField(): void {
    this.validateForm();
  }

  protected handleFieldInput(): void {
    this.generalError.set(null);
    this.validateForm();
  }

  protected fieldError(field: LoginField): string | null {
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
      await this.auth.login(input);

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const destination =
        returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/app';
      await this.router.navigateByUrl(destination);
    } catch (error: unknown) {
      this.generalError.set(getAuthErrorMessage(error, 'login'));
      queueMicrotask(() => this.errorAlert()?.nativeElement.focus());
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private validateForm(): LoginInput | null {
    for (const field of loginFields) {
      this.form.controls[field].setErrors(null);
    }

    const result = loginSchema.safeParse(this.form.getRawValue());

    if (result.success) {
      return result.data;
    }

    const errors = mapZodFieldErrors(result.error, loginFields);
    for (const field of loginFields) {
      const message = errors[field];
      if (message) {
        this.form.controls[field].setErrors({ zod: message });
      }
    }

    return null;
  }

  private focusFirstInvalidField(): void {
    const firstInvalidField = loginFields.find((field) => this.form.controls[field].invalid);

    if (firstInvalidField === 'email') {
      this.emailInput().nativeElement.focus();
    } else if (firstInvalidField === 'password') {
      this.passwordInput().nativeElement.focus();
    }
  }
}

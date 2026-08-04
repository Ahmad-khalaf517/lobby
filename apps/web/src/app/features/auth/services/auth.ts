import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AuthMessageResponse,
  AuthMessageResponseSchema,
  AuthSessionResponse,
  AuthSessionResponseSchema,
  AuthUser,
  ConfirmEmailRequestSchema,
  CurrentUserResponse,
  CurrentUserResponseSchema,
  EmailRequestSchema,
  LoginRequest,
  LoginRequestSchema,
  RegisterRequest,
  RegisterRequestSchema,
  RegistrationResponse,
  RegistrationResponseSchema,
  ResetPasswordRequestSchema,
  VerifyRecoveryRequestSchema,
} from '@lobby/shared';
import { environment } from '../../../../environments/environment';
import { SKIP_AUTH_REFRESH } from '../../../core/auth-http-context';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');
  private readonly authStatus = signal<AuthStatus>('loading');
  private readonly authenticatedUser = signal<AuthUser | null>(null);
  private initialization: Promise<void> | null = null;

  readonly status = this.authStatus.asReadonly();
  readonly user = this.authenticatedUser.asReadonly();

  initialize(): Promise<void> {
    this.initialization ??= this.loadInitialUser();
    return this.initialization;
  }

  async login(payload: LoginRequest): Promise<AuthSessionResponse> {
    const body = LoginRequestSchema.parse(payload);
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/login`, body),
    );
    const result = AuthSessionResponseSchema.parse(response);
    this.setAuthenticated(result.user);
    return result;
  }

  async register(payload: RegisterRequest): Promise<RegistrationResponse> {
    const body = RegisterRequestSchema.parse(payload);
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/register`, body),
    );
    const result = RegistrationResponseSchema.parse(response);

    if (result.user) {
      this.setAuthenticated(result.user);
    }

    return result;
  }

  async getCurrentUser(): Promise<CurrentUserResponse> {
    return this.fetchCurrentUser(false);
  }

  async confirmEmail(tokenHash: string): Promise<AuthSessionResponse> {
    const body = ConfirmEmailRequestSchema.parse({ tokenHash, type: 'email' });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/confirm-email`, body),
    );
    const result = AuthSessionResponseSchema.parse(response);
    this.setAuthenticated(result.user);
    return result;
  }

  async resendConfirmation(email: string): Promise<AuthMessageResponse> {
    const body = EmailRequestSchema.parse({ email });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/resend-confirmation`, body),
    );
    return AuthMessageResponseSchema.parse(response);
  }

  async forgotPassword(email: string): Promise<AuthMessageResponse> {
    const body = EmailRequestSchema.parse({ email });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/forgot-password`, body),
    );
    return AuthMessageResponseSchema.parse(response);
  }

  async verifyRecovery(tokenHash: string): Promise<AuthSessionResponse> {
    const body = VerifyRecoveryRequestSchema.parse({ tokenHash });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/verify-recovery`, body),
    );
    const result = AuthSessionResponseSchema.parse(response);
    this.setAuthenticated(result.user);
    return result;
  }

  async resetPassword(password: string, confirmPassword: string): Promise<AuthMessageResponse> {
    const body = ResetPasswordRequestSchema.parse({ password, confirmPassword });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/reset-password`, body),
    );
    return AuthMessageResponseSchema.parse(response);
  }

  async refreshSession(): Promise<AuthSessionResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/refresh`, {}),
    );
    const result = AuthSessionResponseSchema.parse(response);
    this.setAuthenticated(result.user);
    return result;
  }

  async logout(): Promise<AuthMessageResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/logout`, {}),
    );
    const result = AuthMessageResponseSchema.parse(response);
    this.markUnauthenticated();
    return result;
  }

  markUnauthenticated(): void {
    this.authenticatedUser.set(null);
    this.authStatus.set('unauthenticated');
  }

  private async loadInitialUser(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.markUnauthenticated();
      return;
    }

    try {
      await this.fetchCurrentUser(true);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        try {
          await this.refreshSession();
          return;
        } catch {
          // A missing or expired refresh cookie is the normal signed-out state.
        }
      }

      this.markUnauthenticated();
    }
  }

  private async fetchCurrentUser(skipRefresh: boolean): Promise<CurrentUserResponse> {
    const context = skipRefresh ? new HttpContext().set(SKIP_AUTH_REFRESH, true) : undefined;
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/auth/me`, { context }),
    );
    const result = CurrentUserResponseSchema.parse(response);
    this.setAuthenticated(result.user);
    return result;
  }

  private setAuthenticated(user: AuthUser): void {
    this.authenticatedUser.set(user);
    this.authStatus.set('authenticated');
  }
}

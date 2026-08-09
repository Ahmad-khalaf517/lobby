import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AnonymousAuthRequestSchema,
  AuthMessageResponseSchema,
  AuthSessionResponseSchema,
  ChangePasswordRequestSchema,
  ConfirmEmailRequestSchema,
  CurrentUserResponseSchema,
  EmailRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  RegistrationResponseSchema,
  ResetPasswordRequestSchema,
  VerifyRecoveryRequestSchema,
  type AuthMessageResponse,
  type AuthSessionResponse,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
  type RegistrationResponse,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import { SKIP_AUTH_REFRESH } from '../../../core/auth-http-context';
import { SessionScopeService } from '../../../core/session-scope.service';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';

export type AuthStatus =
  'initializing' | 'anonymous' | 'authenticated' | 'unauthenticated' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = inject(SupabaseSessionService);
  private readonly sessionScope = inject(SessionScopeService);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');
  private readonly authStatus = signal<AuthStatus>('initializing');
  private readonly authenticatedUser = signal<AuthUser | null>(null);
  private initialization: Promise<void> | null = null;
  private refreshRequest: Promise<AuthSessionResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSession: AuthSessionResponse | null = null;
  private sessionRevision = 0;

  readonly status = this.authStatus.asReadonly();
  readonly user = this.authenticatedUser.asReadonly();

  initialize(): Promise<void> {
    this.initialization ??= this.loadInitialUser();
    return this.initialization;
  }

  async ensureGuestSession(captchaToken?: string): Promise<AuthSessionResponse> {
    await this.initialize();
    if (this.status() === 'anonymous' || this.status() === 'authenticated') {
      if (this.currentSession) return this.currentSession;
    }

    const body = AnonymousAuthRequestSchema.parse({ captchaToken });
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/anonymous`, body),
    );
    const result = AuthSessionResponseSchema.parse(response);
    await this.setSession(result);
    return result;
  }

  async login(payload: LoginRequest): Promise<AuthSessionResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/login`, LoginRequestSchema.parse(payload)),
    );
    const result = AuthSessionResponseSchema.parse(response);
    await this.setSession(result);
    return result;
  }

  async register(payload: RegisterRequest): Promise<RegistrationResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/register`, RegisterRequestSchema.parse(payload)),
    );
    const result = RegistrationResponseSchema.parse(response);
    if (result.user) {
      await this.getCurrentUser();
    }
    return result;
  }

  async getCurrentUser(): Promise<AuthSessionResponse> {
    const result = await this.fetchCurrentUser(false);
    await this.setSession(result);
    return result;
  }

  async confirmEmail(tokenHash: string): Promise<AuthSessionResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(
        `${this.apiUrl}/auth/confirm-email`,
        ConfirmEmailRequestSchema.parse({ tokenHash, type: 'email' }),
      ),
    );
    const result = AuthSessionResponseSchema.parse(response);
    await this.setSession(result);
    return result;
  }

  async resendConfirmation(email: string): Promise<AuthMessageResponse> {
    return this.authMessage('/auth/resend-confirmation', EmailRequestSchema.parse({ email }));
  }

  async forgotPassword(email: string): Promise<AuthMessageResponse> {
    return this.authMessage('/auth/forgot-password', EmailRequestSchema.parse({ email }));
  }

  async verifyRecovery(tokenHash: string): Promise<AuthSessionResponse> {
    const response = await firstValueFrom(
      this.http.post<unknown>(
        `${this.apiUrl}/auth/verify-recovery`,
        VerifyRecoveryRequestSchema.parse({ tokenHash }),
      ),
    );
    const result = AuthSessionResponseSchema.parse(response);
    await this.setSession(result);
    return result;
  }

  async resetPassword(password: string, confirmPassword: string): Promise<AuthMessageResponse> {
    return this.authMessage(
      '/auth/reset-password',
      ResetPasswordRequestSchema.parse({ password, confirmPassword }),
    );
  }

  async changePassword(
    currentPassword: string,
    password: string,
    confirmPassword: string,
  ): Promise<AuthMessageResponse> {
    return this.authMessage('/auth/change-password', {
      ...ChangePasswordRequestSchema.parse({ currentPassword, password, confirmPassword }),
    });
  }

  refreshSession(): Promise<AuthSessionResponse> {
    if (this.refreshRequest) return this.refreshRequest;
    const expectedRevision = this.sessionRevision;
    const request = this.performRefresh(expectedRevision).finally(() => {
      if (this.refreshRequest === request) this.refreshRequest = null;
    });
    this.refreshRequest = request;
    return request;
  }

  async logout(): Promise<AuthMessageResponse> {
    // Invalidate pending work before waiting on the network. The API cookies
    // remain available for the server-side token revocation request.
    await this.markUnauthenticated();
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/auth/logout`, {}),
    );
    const result = AuthMessageResponseSchema.parse(response);
    return result;
  }

  async markUnauthenticated(): Promise<void> {
    this.clearRefreshTimer();
    this.sessionRevision += 1;
    this.refreshRequest = null;
    this.authenticatedUser.set(null);
    this.authStatus.set('unauthenticated');
    this.currentSession = null;
    await this.sessionScope.transitionTo(null);
    await this.supabase.clearSession();
  }

  private async loadInitialUser(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      await this.markUnauthenticated();
      return;
    }

    const initialRevision = this.sessionRevision;
    try {
      await this.setSession(await this.fetchCurrentUser(true));
    } catch (error: unknown) {
      if (initialRevision !== this.sessionRevision) return;

      if (error instanceof HttpErrorResponse && error.status === 401) {
        try {
          await this.setSession(await this.fetchRefreshedSession());
          return;
        } catch (refreshError: unknown) {
          console.error('Lobby could not refresh the current session.', refreshError);
          await this.markUnauthenticated();
          return;
        }
      }

      await this.markInitializationFailed(error);
    }
  }

  private async performRefresh(expectedRevision: number): Promise<AuthSessionResponse> {
    try {
      const result = await this.fetchRefreshedSession();
      await this.setSession(result, expectedRevision);
      return result;
    } catch (error: unknown) {
      await this.markUnauthenticated();
      throw error;
    }
  }

  private async setSession(result: AuthSessionResponse, expectedRevision?: number): Promise<void> {
    if (expectedRevision !== undefined && expectedRevision !== this.sessionRevision) {
      throw new Error('The authenticated session changed while the request was pending.');
    }
    this.clearRefreshTimer();
    await this.supabase.setAccessToken(result.accessToken);
    if (expectedRevision !== undefined && expectedRevision !== this.sessionRevision) {
      throw new Error('The authenticated session changed while the request was pending.');
    }
    await this.sessionScope.transitionTo(result.user.id);
    this.sessionRevision += 1;
    this.authenticatedUser.set(result.user);
    this.currentSession = result;
    this.authStatus.set(result.user.isAnonymous ? 'anonymous' : 'authenticated');

    if (result.expiresAt) {
      const refreshInMs = Math.max(1_000, result.expiresAt * 1_000 - Date.now() - 30_000);
      this.refreshTimer = setTimeout(() => {
        void this.refreshSession().catch(() => undefined);
      }, refreshInMs);
    }
  }

  private fetchCurrentUser(skipRefresh: boolean): Promise<AuthSessionResponse> {
    const context = skipRefresh ? new HttpContext().set(SKIP_AUTH_REFRESH, true) : undefined;
    return firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/auth/me`, { context })).then(
      (response) => CurrentUserResponseSchema.parse(response),
    );
  }

  private fetchRefreshedSession(): Promise<AuthSessionResponse> {
    return firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/auth/refresh`, {})).then(
      (response) => AuthSessionResponseSchema.parse(response),
    );
  }

  private async authMessage(path: string, body: unknown): Promise<AuthMessageResponse> {
    const response = await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}${path}`, body));
    return AuthMessageResponseSchema.parse(response);
  }

  private async markInitializationFailed(error: unknown): Promise<void> {
    console.error('Lobby could not restore the current session.', error);
    this.clearRefreshTimer();
    this.sessionRevision += 1;
    this.authenticatedUser.set(null);
    this.authStatus.set('error');
    this.currentSession = null;
    await this.sessionScope.transitionTo(null);
    await this.supabase.clearSession();
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
}

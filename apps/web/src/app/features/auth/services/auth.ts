import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import {
  AnonymousAuthRequestSchema,
  AuthMessageResponseSchema,
  AuthSessionResponseSchema,
  ChangePasswordRequestSchema,
  CurrentUserResponseSchema,
  EmailRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  type AuthMessageResponse,
  type AuthSessionResponse,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
  type RegistrationResponse,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../../core/auth-http-context';
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
  private currentSession: AuthSessionResponse | null = null;
  private sessionRevision = 0;

  readonly status = this.authStatus.asReadonly();
  readonly user = this.authenticatedUser.asReadonly();

  constructor() {
    this.supabase.client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      queueMicrotask(() => {
        if (session) {
          void this.applySession(toAuthSession(session));
        } else if (event === 'SIGNED_OUT') {
          void this.markUnauthenticated();
        }
      });
    });
  }

  initialize(): Promise<void> {
    this.initialization ??= this.loadInitialUser();
    return this.initialization;
  }

  async ensureGuestSession(captchaToken?: string): Promise<AuthSessionResponse> {
    await this.initialize();
    if (
      (this.status() === 'anonymous' || this.status() === 'authenticated') &&
      this.currentSession
    ) {
      return this.currentSession;
    }

    const existingSession = await this.supabase.getSession();
    if (existingSession) {
      const result = toAuthSession(existingSession);
      await this.applySession(result);
      return result;
    }

    const input = AnonymousAuthRequestSchema.parse({ captchaToken });
    const { data, error } = await this.supabase.client.auth.signInAnonymously({
      options: input.captchaToken ? { captchaToken: input.captchaToken } : undefined,
    });
    if (error || !data.session) throw error ?? new Error('Anonymous sign-in failed');
    return this.verifyAndApplySession(data.session);
  }

  async login(payload: LoginRequest): Promise<AuthSessionResponse> {
    const input = LoginRequestSchema.parse(payload);
    const { data, error } = await this.supabase.client.auth.signInWithPassword(input);
    if (error || !data.session) throw error ?? new Error('Sign-in did not return a session');
    return this.verifyAndApplySession(data.session);
  }

  async register(payload: RegisterRequest): Promise<RegistrationResponse> {
    const input = RegisterRequestSchema.parse(payload);
    const { data, error } = await this.supabase.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: this.redirectUrl('/confirm-email'),
        data: { name: input.name },
      },
    });
    if (error || !data.user) throw error ?? new Error('Registration failed');

    if (data.session) await this.verifyAndApplySession(data.session);
    return {
      message: 'Registration successful. Check your email to confirm your account.',
      ...(data.session ? { user: toAuthUser(data.user) } : {}),
    };
  }

  async getCurrentUser(): Promise<AuthSessionResponse> {
    const result = await this.fetchCurrentUser(false);
    await this.applySession(result);
    return result;
  }

  async confirmEmail(tokenHash: string): Promise<AuthSessionResponse> {
    const { data, error } = await this.supabase.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (error || !data.session) throw error ?? new Error('Confirmation did not return a session');
    return this.verifyAndApplySession(data.session);
  }

  async restoreEmailConfirmationRedirect(): Promise<AuthSessionResponse | null> {
    const session = await this.supabase.getSession();
    return session ? this.verifyAndApplySession(session) : null;
  }

  async resendConfirmation(email: string): Promise<AuthMessageResponse> {
    const input = EmailRequestSchema.parse({ email });
    const { error } = await this.supabase.client.auth.resend({
      type: 'signup',
      email: input.email,
      options: { emailRedirectTo: this.redirectUrl('/confirm-email') },
    });
    if (error) throw error;
    return { message: 'If the account can be confirmed, a new email has been sent.' };
  }

  async forgotPassword(email: string): Promise<AuthMessageResponse> {
    const input = EmailRequestSchema.parse({ email });
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(input.email, {
      redirectTo: this.redirectUrl('/reset-password'),
    });
    if (error) throw error;
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  async verifyRecovery(tokenHash: string): Promise<AuthSessionResponse> {
    const { data, error } = await this.supabase.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error || !data.session) throw error ?? new Error('Recovery did not return a session');
    return this.verifyAndApplySession(data.session);
  }

  async restorePasswordRecoveryRedirect(): Promise<AuthSessionResponse | null> {
    if (!this.supabase.hasPasswordRecoverySession()) return null;
    const session = await this.supabase.getSession();
    return session ? this.verifyAndApplySession(session) : null;
  }

  async resetPassword(password: string, confirmPassword: string): Promise<AuthMessageResponse> {
    const input = ResetPasswordRequestSchema.parse({ password, confirmPassword });
    const { error } = await this.supabase.client.auth.updateUser({ password: input.password });
    if (error) throw error;
    this.supabase.finishPasswordRecovery();
    return { message: 'Password updated successfully.' };
  }

  async changePassword(
    currentPassword: string,
    password: string,
    confirmPassword: string,
  ): Promise<AuthMessageResponse> {
    const input = ChangePasswordRequestSchema.parse({
      currentPassword,
      password,
      confirmPassword,
    });
    const { error } = await this.supabase.client.auth.updateUser({
      password: input.password,
      current_password: input.currentPassword,
    });
    if (error) throw error;
    return { message: 'Password updated successfully.' };
  }

  refreshSession(): Promise<AuthSessionResponse> {
    if (this.refreshRequest) return this.refreshRequest;
    const request = this.performRefresh().finally(() => {
      if (this.refreshRequest === request) this.refreshRequest = null;
    });
    this.refreshRequest = request;
    return request;
  }

  async logout(): Promise<AuthMessageResponse> {
    const { error } = await this.supabase.client.auth.signOut();
    await this.markUnauthenticated();
    if (error) throw error;
    return AuthMessageResponseSchema.parse({ message: 'Logged out successfully' });
  }

  async markUnauthenticated(): Promise<void> {
    this.sessionRevision += 1;
    this.refreshRequest = null;
    this.authenticatedUser.set(null);
    this.authStatus.set('unauthenticated');
    this.currentSession = null;
    await this.sessionScope.transitionTo(null);
  }

  private async loadInitialUser(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      await this.markUnauthenticated();
      return;
    }

    let restoredUserId: string | null = null;
    try {
      const session = await this.supabase.getSession();
      if (!session) {
        await this.markUnauthenticated();
        return;
      }
      restoredUserId = session.user.id;
      const verified = await this.fetchCurrentUser(true);
      const currentSession = await this.supabase.getSession();
      if (currentSession?.user.id !== restoredUserId) return;
      await this.applySession(verified);
    } catch (error: unknown) {
      const currentSession = await this.supabase.getSession().catch(() => null);
      if (restoredUserId && currentSession?.user.id !== restoredUserId) return;

      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.supabase.client.auth.signOut({ scope: 'local' });
        await this.markUnauthenticated();
        return;
      }

      await this.markInitializationFailed(error);
    }
  }

  private async performRefresh(): Promise<AuthSessionResponse> {
    const { data, error } = await this.supabase.client.auth.refreshSession();
    if (error || !data.session) {
      await this.supabase.client.auth.signOut({ scope: 'local' });
      await this.markUnauthenticated();
      throw error ?? new Error('Session could not be refreshed');
    }

    const result = toAuthSession(data.session);
    await this.applySession(result);
    return result;
  }

  private async verifyAndApplySession(session: Session): Promise<AuthSessionResponse> {
    const localSession = toAuthSession(session);
    await this.applySession(localSession);
    const verified = await this.fetchCurrentUser(false);
    await this.applySession(verified);
    return verified;
  }

  private async applySession(result: AuthSessionResponse): Promise<void> {
    await this.sessionScope.transitionTo(result.user.id);
    this.sessionRevision += 1;
    this.authenticatedUser.set(result.user);
    this.currentSession = result;
    this.authStatus.set(result.user.isAnonymous ? 'anonymous' : 'authenticated');
  }

  private fetchCurrentUser(skipErrorToast: boolean): Promise<AuthSessionResponse> {
    const context = skipErrorToast ? new HttpContext().set(SKIP_ERROR_TOAST, true) : undefined;
    return firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/auth/me`, { context })).then(
      (response) => CurrentUserResponseSchema.parse(response),
    );
  }

  private async markInitializationFailed(error: unknown): Promise<void> {
    console.error('Lobby could not verify the current Supabase session with the API.', error);
    this.sessionRevision += 1;
    this.authenticatedUser.set(null);
    this.authStatus.set('error');
    this.currentSession = null;
    await this.sessionScope.transitionTo(null);
  }

  private redirectUrl(path: string): string {
    if (!isPlatformBrowser(this.platformId)) return path;
    return new URL(path, window.location.origin).toString();
  }
}

function toAuthSession(session: Session): AuthSessionResponse {
  return AuthSessionResponseSchema.parse({
    user: toAuthUser(session.user),
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
  });
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email?.trim() ? user.email : null,
    isAnonymous: user.is_anonymous === true,
    userMetadata: user.user_metadata,
  };
}

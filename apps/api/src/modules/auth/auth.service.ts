import type {
  AnonymousAuthRequest,
  ChangePasswordRequest,
  ConfirmEmailRequest,
  EmailRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyRecoveryRequest,
} from '@lobby/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import { SupabaseService } from '../database/supabase.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly users: UsersService,
  ) {}

  async login(dto: LoginRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.ensureRegisteredProfile(data.session.user);
    return { user: data.session.user, session: data.session };
  }

  async signInAnonymously(dto: AnonymousAuthRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.signInAnonymously({
      options: dto.captchaToken ? { captchaToken: dto.captchaToken } : undefined,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(error?.message ?? 'Anonymous sign-in failed');
    }

    return { user: data.session.user, session: data.session };
  }

  async register(dto: RegisterRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        emailRedirectTo: `${this.webOrigin()}/confirm-email`,
        data: { name: dto.name },
      },
    });

    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? 'Registration failed');
    }

    if (data.session) await this.ensureRegisteredProfile(data.user);
    return { user: data.user, session: data.session };
  }

  async getCurrentUser(accessToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    await this.ensureRegisteredProfile(data.user);
    return { user: data.user };
  }

  async refreshSession(refreshToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    let result: Awaited<ReturnType<typeof supabase.auth.refreshSession>>;

    try {
      result = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
    } catch (error: unknown) {
      this.throwRefreshFailure(error);
    }

    const { data, error } = result;

    if (error || !data.session) {
      this.throwRefreshFailure(error);
    }

    this.logger.debug('Auth session refresh succeeded');
    await this.ensureRegisteredProfile(data.session.user);
    return { user: data.session.user, session: data.session };
  }

  async confirmEmail(dto: ConfirmEmailRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: dto.tokenHash,
      type: dto.type,
    });

    if (error || !data.user || !data.session) {
      throw new BadRequestException('The confirmation link is invalid or expired');
    }

    await this.ensureRegisteredProfile(data.user);
    return { user: data.user, session: data.session };
  }

  async resendConfirmation(dto: EmailRequest): Promise<void> {
    const supabase = this.supabaseService.createAuthClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: dto.email,
      options: {
        emailRedirectTo: `${this.webOrigin()}/confirm-email`,
      },
    });

    if (error) {
      this.logger.warn(`Confirmation resend was not accepted: ${error.message}`);
    }
  }

  async forgotPassword(dto: EmailRequest): Promise<void> {
    const supabase = this.supabaseService.createAuthClient();

    const { error } = await supabase.auth.resetPasswordForEmail(dto.email, {
      redirectTo: `${this.webOrigin()}/reset-password`,
    });

    if (error) {
      this.logger.warn(`Password recovery request was not accepted: ${error.message}`);
    }
  }

  async verifyRecovery(dto: VerifyRecoveryRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: dto.tokenHash,
      type: 'recovery',
    });

    if (error || !data.user || !data.session) {
      throw new BadRequestException('The password reset link is invalid or expired');
    }

    await this.ensureRegisteredProfile(data.user);
    return { user: data.user, session: data.session };
  }

  async resetPassword(dto: ResetPasswordRequest, accessToken: string, refreshToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError || !sessionData.session) {
      throw new UnauthorizedException('The recovery session is invalid or expired');
    }

    const { data, error } = await supabase.auth.updateUser({
      password: dto.password,
    });

    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? 'Password could not be updated');
    }

    return { user: data.user, session: sessionData.session };
  }

  async changePassword(dto: ChangePasswordRequest, accessToken: string, refreshToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError || !sessionData.session) {
      throw new UnauthorizedException('The signed-in session is invalid or expired');
    }

    const { data, error } = await supabase.auth.updateUser({
      password: dto.password,
      current_password: dto.currentPassword,
    });

    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? 'Password could not be updated');
    }

    return { user: data.user, session: sessionData.session };
  }

  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    if (!accessToken || !refreshToken) {
      return;
    }

    const supabase = this.supabaseService.createAuthClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      this.logger.warn(`Supabase logout was not accepted: ${error.message}`);
    }
  }

  private webOrigin(): string {
    return (process.env.WEB_ORIGIN ?? 'http://localhost:4200').replace(/\/$/, '');
  }

  private async ensureRegisteredProfile(user: User): Promise<void> {
    if (user.is_anonymous !== true) await this.users.ensureProfile(user);
  }

  tokenExpiresAt(accessToken: string): number | null {
    try {
      const payloadPart = accessToken.split('.')[1];
      if (!payloadPart) return null;

      const parsed: unknown = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'exp' in parsed &&
        typeof parsed.exp === 'number'
      ) {
        return parsed.exp;
      }
    } catch {
      return null;
    }

    return null;
  }

  private throwRefreshFailure(error: unknown): never {
    if (isAuthRetryableFetchError(error)) {
      this.logger.warn('Auth session refresh temporarily unavailable');
      throw new ServiceUnavailableException('Session refresh is temporarily unavailable');
    }

    this.logger.warn('Auth session refresh rejected');
    throw new UnauthorizedException('Session could not be refreshed');
  }
}

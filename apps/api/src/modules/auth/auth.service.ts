import type {
  ConfirmEmailRequest,
  EmailRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyRecoveryRequest,
} from '@lobby/shared';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async login(dto: LoginRequest) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
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

    return { user: data.user, session: data.session };
  }

  async getCurrentUser(accessToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return { user: data.user };
  }

  async refreshSession(refreshToken: string) {
    const supabase = this.supabaseService.createAuthClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Session could not be refreshed');
    }

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
}

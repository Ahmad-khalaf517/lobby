import type {
  AuthMessageResponse,
  AuthSessionResponse,
  ConfirmEmailRequest,
  CurrentUserResponse,
  EmailRequest,
  LoginRequest,
  RegisterRequest,
  RegistrationResponse,
  ResetPasswordRequest,
  VerifyRecoveryRequest,
} from '@lobby/shared';
import {
  ConfirmEmailRequestSchema,
  EmailRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  VerifyRecoveryRequestSchema,
} from '@lobby/shared';
import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ZodValidationPipe } from '../../zod-validation.pipe';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from './auth-cookies';
import { toAuthUser } from './auth.mapper';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) dto: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.login(dto);
    setAuthCookies(response, result.session);

    return {
      user: toAuthUser(result.user),
      expiresAt: result.session.expires_at ?? null,
    };
  }

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) dto: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegistrationResponse> {
    const result = await this.authService.register(dto);

    if (result.session) {
      setAuthCookies(response, result.session);
    }

    return {
      message: 'Registration successful. Check your email to confirm your account.',
      ...(result.session ? { user: toAuthUser(result.user) } : {}),
    };
  }

  @Get('me')
  async getCurrentUser(@Req() request: Request): Promise<CurrentUserResponse> {
    const { accessToken } = readAuthCookies(request);
    if (!accessToken) {
      throw new UnauthorizedException('Missing session');
    }

    const result = await this.authService.getCurrentUser(accessToken);
    return { user: toAuthUser(result.user) };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const { refreshToken } = readAuthCookies(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const result = await this.authService.refreshSession(refreshToken);
    setAuthCookies(response, result.session);

    return {
      user: toAuthUser(result.user),
      expiresAt: result.session.expires_at ?? null,
    };
  }

  @Post('confirm-email')
  async confirmEmail(
    @Body(new ZodValidationPipe(ConfirmEmailRequestSchema)) dto: ConfirmEmailRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.confirmEmail(dto);
    setAuthCookies(response, result.session);

    return {
      user: toAuthUser(result.user),
      expiresAt: result.session.expires_at ?? null,
    };
  }

  @Post('resend-confirmation')
  async resendConfirmation(
    @Body(new ZodValidationPipe(EmailRequestSchema)) dto: EmailRequest,
  ): Promise<AuthMessageResponse> {
    await this.authService.resendConfirmation(dto);
    return { message: 'If the account can be confirmed, a new email has been sent.' };
  }

  @Post('forgot-password')
  async forgotPassword(
    @Body(new ZodValidationPipe(EmailRequestSchema)) dto: EmailRequest,
  ): Promise<AuthMessageResponse> {
    await this.authService.forgotPassword(dto);
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  @Post('verify-recovery')
  async verifyRecovery(
    @Body(new ZodValidationPipe(VerifyRecoveryRequestSchema)) dto: VerifyRecoveryRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.verifyRecovery(dto);
    setAuthCookies(response, result.session);

    return {
      user: toAuthUser(result.user),
      expiresAt: result.session.expires_at ?? null,
    };
  }

  @Post('reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema)) dto: ResetPasswordRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthMessageResponse> {
    const { accessToken, refreshToken } = readAuthCookies(request);
    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException('Missing recovery session');
    }

    const result = await this.authService.resetPassword(dto, accessToken, refreshToken);
    setAuthCookies(response, result.session);
    return { message: 'Password updated successfully.' };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthMessageResponse> {
    const { accessToken, refreshToken } = readAuthCookies(request);

    try {
      await this.authService.logout(accessToken, refreshToken);
    } finally {
      clearAuthCookies(response);
    }

    return { message: 'Logged out successfully' };
  }
}

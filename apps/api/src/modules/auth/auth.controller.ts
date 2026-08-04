import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';

import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { type LoginDto, LoginSchema } from './dto/login.dto/login.dto';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginSchema))
    dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    response.cookie('access_token', result.session.access_token, {
      ...cookieOptions,
      maxAge: result.session.expires_in * 1000,
    });

    response.cookie('refresh_token', result.session.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      user: result.user,
      expiresAt: result.session.expires_at,
    };
  }

  @Get('me')
  getCurrentUser(@Req() request: Request) {
    const accessToken = request.cookies?.access_token as string | undefined;

    if (!accessToken) {
      throw new UnauthorizedException('Missing session');
    }

    return this.authService.getCurrentUser(accessToken);
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.refresh_token as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const result = await this.authService.refreshSession(refreshToken);

    response.cookie('access_token', result.session.access_token, {
      ...cookieOptions,
      maxAge: result.session.expires_in * 1000,
    });

    response.cookie('refresh_token', result.session.refresh_token, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      user: result.user,
      expiresAt: result.session.expires_at,
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token', cookieOptions);
    response.clearCookie('refresh_token', cookieOptions);

    return {
      message: 'Logged out successfully',
    };
  }
}

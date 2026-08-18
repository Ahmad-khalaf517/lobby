import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../../modules/database/supabase.service';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/auth-cookies';

export type AuthenticatedRequest = Request & {
  user: User;
  accessToken: string;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = extractRequestAccessToken(request);

    if (!accessToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.supabaseService.verifyAccessToken(accessToken);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.user = user;
    request.accessToken = accessToken;

    return true;
  }
}

/** Bearer authentication takes precedence. A present malformed header never falls back to cookies. */
export function extractRequestAccessToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;

  if (authorization !== undefined) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) {
      throw new UnauthorizedException('Malformed Authorization header');
    }
    return match[1];
  }

  const cookieToken = request.cookies?.[ACCESS_TOKEN_COOKIE] as unknown;
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
}

export function extractBearerAccessToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return undefined;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new UnauthorizedException('Malformed Authorization header');
  }
  return match[1];
}

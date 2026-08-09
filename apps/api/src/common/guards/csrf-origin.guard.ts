import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import {
  ACCESS_TOKEN_COOKIE,
  RECOVERY_PROOF_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../modules/auth/auth-cookies';
import { normalizeOrigin, trustedOrigins } from '../security/trusted-origins';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase()) || !hasAuthCookie(request)) return true;

    const suppliedOrigin = request.get('origin') ?? originFromReferer(request.get('referer'));
    if (suppliedOrigin && trustedOrigins().includes(suppliedOrigin)) return true;

    throw new ForbiddenException({
      code: 'UNTRUSTED_ORIGIN',
      message: 'Cookie-authenticated state changes require a trusted Origin',
      error: 'Forbidden',
    });
  }
}

function hasAuthCookie(request: Request): boolean {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  return Boolean(
    cookies?.[ACCESS_TOKEN_COOKIE] ||
    cookies?.[REFRESH_TOKEN_COOKIE] ||
    cookies?.[RECOVERY_PROOF_COOKIE],
  );
}

function originFromReferer(referer?: string): string | null {
  return referer ? normalizeOrigin(referer) : null;
}

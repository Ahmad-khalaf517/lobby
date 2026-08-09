import type { Session } from '@supabase/supabase-js';
import type { CookieOptions, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const RECOVERY_PROOF_COOKIE = 'password_recovery_proof';

const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_PROOF_MAX_AGE_MS = 15 * 60 * 1000;

function authCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    // The deployed Vercel UI and Render API are different sites. Credentialed
    // browser requests can include these cookies only when production opts in
    // to cross-site use; SameSite=None also requires Secure.
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
}

function accessTokenMaxAge(session: Session): number {
  if (session.expires_at) {
    return Math.max(0, session.expires_at * 1000 - Date.now());
  }

  return session.expires_in * 1000;
}

export function setAuthCookies(response: Response, session: Session): void {
  clearRecoveryProofCookie(response);
  response.cookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...authCookieOptions(),
    maxAge: accessTokenMaxAge(session),
  });
  response.cookie(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...authCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

export function setRecoveryProofCookie(response: Response, session: Session): void {
  response.cookie(RECOVERY_PROOF_COOKIE, recoveryProof(session.refresh_token), {
    ...authCookieOptions(),
    maxAge: RECOVERY_PROOF_MAX_AGE_MS,
  });
}

export function hasValidRecoveryProof(request: Request, refreshToken: string): boolean {
  const supplied = request.cookies?.[RECOVERY_PROOF_COOKIE] as unknown;
  if (typeof supplied !== 'string') return false;

  const expectedBuffer = Buffer.from(recoveryProof(refreshToken));
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export function clearRecoveryProofCookie(response: Response): void {
  response.clearCookie(RECOVERY_PROOF_COOKIE, authCookieOptions());
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, authCookieOptions());
  response.clearCookie(REFRESH_TOKEN_COOKIE, authCookieOptions());
  clearRecoveryProofCookie(response);
}

function recoveryProof(refreshToken: string): string {
  return createHash('sha256')
    .update(`lobby-password-recovery\0${refreshToken}`)
    .digest('base64url');
}

export function readAuthCookies(request: Request): {
  accessToken?: string;
  refreshToken?: string;
} {
  const accessToken = request.cookies?.[ACCESS_TOKEN_COOKIE] as unknown;
  const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as unknown;

  return {
    ...(typeof accessToken === 'string' ? { accessToken } : {}),
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
  };
}

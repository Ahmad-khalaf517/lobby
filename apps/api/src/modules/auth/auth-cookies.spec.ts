import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';

import {
  hasValidRecoveryProof,
  RECOVERY_PROOF_COOKIE,
  setAuthCookies,
  setRecoveryProofCookie,
} from './auth-cookies';

describe('password recovery proof cookie', () => {
  it('is issued only for recovery and is bound to its refresh token', () => {
    const cookies: Record<string, string> = {};
    const response = responseFor(cookies);
    const session = { refresh_token: 'recovery-refresh' } as Session;

    setRecoveryProofCookie(response, session);

    expect(cookies[RECOVERY_PROOF_COOKIE]).toBeDefined();
    expect(hasValidRecoveryProof(requestFor(cookies), 'recovery-refresh')).toBe(true);
    expect(hasValidRecoveryProof(requestFor(cookies), 'ordinary-refresh')).toBe(false);
  });

  it('clears recovery authority when ordinary auth cookies are established', () => {
    const cookies: Record<string, string> = { [RECOVERY_PROOF_COOKIE]: 'proof' };
    setAuthCookies(responseFor(cookies), {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
    } as Session);

    expect(cookies[RECOVERY_PROOF_COOKIE]).toBeUndefined();
  });
});

function responseFor(cookies: Record<string, string>): Response {
  return {
    cookie: (name: string, value: string) => {
      cookies[name] = value;
    },
    clearCookie: (name: string) => {
      delete cookies[name];
    },
  } as unknown as Response;
}

function requestFor(cookies: Record<string, string>): Request {
  return { cookies } as Request;
}

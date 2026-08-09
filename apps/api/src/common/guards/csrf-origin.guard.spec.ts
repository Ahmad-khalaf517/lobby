import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { CsrfOriginGuard } from './csrf-origin.guard';

describe('CsrfOriginGuard', () => {
  const originalOrigins = process.env.CORS_ORIGINS;
  const guard = new CsrfOriginGuard();

  beforeEach(() => {
    process.env.CORS_ORIGINS = 'https://app.example.com,http://localhost:4200';
  });

  afterAll(() => {
    process.env.CORS_ORIGINS = originalOrigins;
  });

  it('allows safe methods and cookie-free public requests', () => {
    expect(guard.canActivate(contextFor('GET', {}, 'https://evil.example'))).toBe(true);
    expect(guard.canActivate(contextFor('POST', {}, 'https://evil.example'))).toBe(true);
  });

  it('allows a cookie-authenticated mutation from a trusted Origin', () => {
    expect(
      guard.canActivate(contextFor('PATCH', { access_token: 'token' }, 'https://app.example.com')),
    ).toBe(true);
  });

  it('rejects an untrusted or missing Origin for cookie-authenticated mutations', () => {
    expect(() =>
      guard.canActivate(contextFor('DELETE', { refresh_token: 'token' }, 'https://evil.example')),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor('POST', { access_token: 'token' }))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts a trusted Referer when Origin is unavailable', () => {
    expect(
      guard.canActivate(
        contextFor('POST', { access_token: 'token' }, undefined, 'https://app.example.com/page'),
      ),
    ).toBe(true);
  });
});

function contextFor(
  method: string,
  cookies: Record<string, string>,
  origin?: string,
  referer?: string,
): ExecutionContext {
  const headers: Record<string, string | undefined> = { origin, referer };
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, cookies, get: (name: string) => headers[name.toLowerCase()] }),
    }),
  } as ExecutionContext;
}

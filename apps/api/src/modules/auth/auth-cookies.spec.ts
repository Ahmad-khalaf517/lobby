import type { Session } from '@supabase/supabase-js';
import type { Response } from 'express';

import {
  ACCESS_TOKEN_COOKIE,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
} from './auth-cookies';

describe('auth cookies', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('uses cross-site compatible secure cookies in production', () => {
    process.env.NODE_ENV = 'production';
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    setAuthCookies(response, session());

    expect(cookie).toHaveBeenNthCalledWith(
      1,
      ACCESS_TOKEN_COOKIE,
      'access-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      REFRESH_TOKEN_COOKIE,
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      }),
    );
  });

  it('keeps localhost cookies compatible with HTTP development', () => {
    process.env.NODE_ENV = 'development';
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    setAuthCookies(response, session());

    expect(cookie).toHaveBeenCalledTimes(2);
    for (const call of cookie.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    }
  });

  it('clears both cookies with the same production attributes used to set them', () => {
    process.env.NODE_ENV = 'production';
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    clearAuthCookies(response);

    expect(clearCookie).toHaveBeenNthCalledWith(1, ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
    expect(clearCookie).toHaveBeenNthCalledWith(2, REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  });
});

function session(): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3_600,
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
  } as Session;
}

import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { RegisteredUserGuard } from './registered-user.guard';

describe('RegisteredUserGuard', () => {
  const guard = new RegisteredUserGuard();

  it('allows registered accounts', () => {
    expect(guard.canActivate(contextFor({ id: 'registered', is_anonymous: false }))).toBe(true);
  });

  it('rejects anonymous accounts and a missing authenticated user', () => {
    expect(() => guard.canActivate(contextFor({ id: 'guest', is_anonymous: true }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

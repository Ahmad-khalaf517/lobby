import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from './supabase-auth.guard';

/**
 * Rejects anonymous (guest) Supabase sessions.
 *
 * Guests sign in through Supabase Anonymous Auth, so they carry a perfectly
 * valid access token and pass SupabaseAuthGuard. That is intentional for the
 * guest call path, but servers and their channels are a registered-account
 * feature — without this guard a guest session could create/rename/delete
 * server channels. Always stack it after SupabaseAuthGuard, which is what
 * populates `request.user`.
 */
@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_AUTHENTICATED',
        message: 'Authenticated user was not found',
        error: 'Forbidden',
      });
    }

    if (user.is_anonymous === true) {
      throw new ForbiddenException({
        code: 'REGISTERED_ACCOUNT_REQUIRED',
        message: 'Create an account to use servers and channels',
        error: 'Forbidden',
      });
    }

    return true;
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from './supabase-auth.guard';

@Injectable()
export class SameUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authenticatedUserId = request.user?.id;
    const requestedUserId = request.params.userId;

    if (!authenticatedUserId) {
      throw new ForbiddenException({
        code: 'USER_NOT_AUTHENTICATED',
        message: 'Authenticated user was not found',
        error: 'Forbidden',
      });
    }

    if (!requestedUserId) {
      throw new ForbiddenException({
        code: 'USER_ID_MISSING',
        message: 'User ID is missing from the route',
        error: 'Forbidden',
      });
    }

    if (authenticatedUserId !== requestedUserId) {
      throw new ForbiddenException({
        code: 'USER_ACCESS_DENIED',
        message: 'You cannot access another user’s resource',
        error: 'Forbidden',
      });
    }

    return true;
  }
}

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth';

export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.initialize();

  if (authService.status() === 'unauthenticated') {
    return true;
  }

  // Already authenticated: redirect away from guest-only pages.
  return router.createUrlTree(['/app']);
};

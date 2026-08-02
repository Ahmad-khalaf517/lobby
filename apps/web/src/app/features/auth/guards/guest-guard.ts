import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth';

export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const { data, error } = await authService.getSession();

  // No usable session means the visitor may access login/register.
  if (error || !data.session) {
    return true;
  }

  // Already authenticated: redirect away from guest-only pages.
  return router.createUrlTree(['/app']);
};

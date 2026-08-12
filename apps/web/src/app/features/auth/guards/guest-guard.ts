import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Public auth pages must not wait for a remote session check. If restoration
  // has already completed, preserve the existing signed-in redirect.
  return authService.status() === 'authenticated' ? router.createUrlTree(['/app']) : true;
};

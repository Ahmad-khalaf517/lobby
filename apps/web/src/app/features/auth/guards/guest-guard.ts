import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth';

export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.initialize();

  // When session restoration fails, keep the sign-in experience reachable so
  // the user can retry instead of being trapped behind a redirect.
  return authService.status() === 'authenticated' ? router.createUrlTree(['/app']) : true;
};

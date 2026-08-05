import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.initialize();

  if (auth.status() === 'authenticated') {
    return true;
  }

  if (auth.status() === 'error') {
    return router.createUrlTree(['/unauthorized']);
  }

  return router.createUrlTree(['/login'], {
    queryParams: {
      returnUrl: state.url,
    },
  });
};

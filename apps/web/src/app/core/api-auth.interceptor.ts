import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { environment } from '../../environments/environment';
import { SupabaseSessionService } from './supabase/supabase-session.service';

const apiUrl = environment.apiUrl.replace(/\/$/, '');

export function isNestApiRequest(url: string): boolean {
  return url === apiUrl || url.startsWith(`${apiUrl}/`);
}

/** Attach the current Supabase JWT to NestJS calls without cross-site cookies. */
export const apiAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isNestApiRequest(request.url) || request.headers.has('Authorization')) {
    return next(request);
  }

  const supabase = inject(SupabaseSessionService);
  return from(supabase.getAccessToken()).pipe(
    switchMap((accessToken) =>
      next(
        accessToken
          ? request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
          : request,
      ),
    ),
  );
};

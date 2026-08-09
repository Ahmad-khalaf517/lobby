import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, from, Observable, shareReplay, switchMap, throwError } from 'rxjs';

import type { AuthSessionResponse } from '@lobby/shared';
import { environment } from '../../environments/environment';
import { AuthService } from '../features/auth/services/auth';
import { AUTH_RETRY_ATTEMPTED, SKIP_AUTH_REFRESH } from './auth-http-context';
import { isNestApiRequest } from './api-credentials.interceptor';

const apiUrl = environment.apiUrl.replace(/\/$/, '');
const refreshExcludedPaths = new Set([
  '/auth/anonymous',
  '/auth/login',
  '/auth/register',
  '/auth/confirm-email',
  '/auth/resend-confirmation',
  '/auth/forgot-password',
  '/auth/verify-recovery',
  '/auth/reset-password',
  '/auth/refresh',
  '/auth/logout',
]);

let refreshRequest$: Observable<AuthSessionResponse> | null = null;

function requestPath(url: string): string {
  return url.slice(apiUrl.length).split('?')[0] ?? '';
}

export const authRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const cannotRefresh =
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !isNestApiRequest(request.url) ||
        auth.status() === 'unauthenticated' ||
        request.context.get(SKIP_AUTH_REFRESH) ||
        request.context.get(AUTH_RETRY_ATTEMPTED) ||
        refreshExcludedPaths.has(requestPath(request.url));

      if (cannotRefresh) {
        return throwError(() => error);
      }

      if (!refreshRequest$) {
        refreshRequest$ = from(auth.refreshSession()).pipe(
          catchError((refreshError: unknown) => {
            // Any failed refresh invalidates the local auth scope and every
            // dashboard cache before navigation, so stale data cannot remain.
            if (auth.status() === 'unauthenticated') {
              void router.navigate(['/login'], {
                queryParams: { returnUrl: router.url },
              });
            }
            return throwError(() => refreshError);
          }),
          finalize(() => {
            refreshRequest$ = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      }

      return refreshRequest$.pipe(
        switchMap(() =>
          next(
            request.clone({
              context: request.context.set(AUTH_RETRY_ATTEMPTED, true),
            }),
          ),
        ),
      );
    }),
  );
};

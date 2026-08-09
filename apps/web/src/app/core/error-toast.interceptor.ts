import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SKIP_ERROR_TOAST } from './auth-http-context';
import { ToastService } from './toast/toast.service';

function extractMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Could not reach the server. Check your connection.';
  }

  const body = error.error as { message?: unknown; error?: unknown } | null;
  const message = body?.message;

  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message.join(' ');
  if (typeof body?.error === 'string' && body.error.trim()) return body.error;

  return 'Something went wrong. Please try again.';
}

/**
 * Surfaces every failed API request as a toast. Sits outside
 * authRefreshInterceptor in the chain (registered before it) so a 401 that
 * gets silently retried after a token refresh never flashes an error toast.
 */
export const errorToastInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !request.context.get(SKIP_ERROR_TOAST)) {
        toast.error(extractMessage(error));
      }
      return throwError(() => error);
    }),
  );
};

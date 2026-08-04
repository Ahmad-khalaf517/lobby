import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../environments/environment';

const apiUrl = environment.apiUrl.replace(/\/$/, '');

export function isNestApiRequest(url: string): boolean {
  return url === apiUrl || url.startsWith(`${apiUrl}/`);
}

export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isNestApiRequest(request.url)) {
    return next(request);
  }

  return next(request.clone({ withCredentials: true }));
};

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiAuthInterceptor } from './core/api-auth.interceptor';
import { authRefreshInterceptor } from './core/auth-refresh.interceptor';
import { errorToastInterceptor } from './core/error-toast.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([apiAuthInterceptor, errorToastInterceptor, authRefreshInterceptor]),
    ),
  ],
};

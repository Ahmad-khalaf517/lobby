import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { apiCredentialsInterceptor } from './core/api-credentials.interceptor';
import { authRefreshInterceptor } from './core/auth-refresh.interceptor';
import { AuthService } from './features/auth/services/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptors([apiCredentialsInterceptor, authRefreshInterceptor])),
    provideAppInitializer(() => inject(AuthService).initialize()),
  ],
};

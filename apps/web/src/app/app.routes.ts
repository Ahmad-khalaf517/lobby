import { Routes } from '@angular/router';
import { guestGuard } from './features/auth/guards/guest-guard';
import { authGuard } from './features/auth/guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/auth/layouts/auth-layout/auth-layout').then(
        (component) => component.AuthLayout,
      ),
    children: [
      {
        path: 'login',
        title: 'Login | Lobby',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/login-page/login-page').then(
            (component) => component.LoginPage,
          ),
      },
      {
        path: 'register',
        title: 'Register | Lobby',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/register-page/register-page').then(
            (component) => component.RegisterPage,
          ),
      },
      {
        path: 'forgot-password',
        title: 'Forgot Password | Lobby',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/forgot-password-page/forgot-password-page').then(
            (component) => component.ForgotPasswordPage,
          ),
      },
      {
        path: 'auth/confirm',
        title: 'Confirm Email | Lobby',
        loadComponent: () =>
          import('./features/auth/pages/confirm-email-page/confirm-email-page').then(
            (component) => component.ConfirmEmailPage,
          ),
      },
      {
        path: 'auth/reset-password',
        title: 'Reset Password | Lobby',
        loadComponent: () =>
          import('./features/auth/pages/reset-password-page/reset-password-page').then(
            (component) => component.ResetPasswordPage,
          ),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Lobby',
    loadComponent: () =>
      import('./features/landing/landing-page/landing-page').then(
        (component) => component.LandingPage,
      ),
  },
  {
    path: 'guest/:inviteCode',
    title: 'Guest Room | Lobby',
    loadComponent: () =>
      import('./features/guest-room/guest-room-page/guest-room-page').then(
        (component) => component.GuestRoomPage,
      ),
  },
  {
    path: 'app',
    title: 'Dashboard | Lobby',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/lobby/lobby-page/lobby-page').then((component) => component.LobbyPage),
  },
  {
    path: 'unauthorized',
    title: 'Unauthorized | Lobby',
    loadComponent: () =>
      import('./features/errors/unauthorized-page/unauthorized-page').then(
        (component) => component.UnauthorizedPage,
      ),
  },
  {
    path: '**',
    title: 'Page Not Found | Lobby',
    loadComponent: () =>
      import('./features/errors/not-found-page/not-found-page').then(
        (component) => component.NotFoundPage,
      ),
  },
];

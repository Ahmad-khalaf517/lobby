import { Routes } from '@angular/router';
import { guestGuard } from './features/auth/guards/guest-guard';
import { authGuard } from './features/auth/guards/auth-guard';

export const routes: Routes = [
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
        path: 'confirm-email',
        title: 'Confirm Email | Lobby',
        loadComponent: () =>
          import('./features/auth/pages/confirm-email-page/confirm-email-page').then(
            (component) => component.ConfirmEmailPage,
          ),
      },
      {
        path: 'reset-password',
        title: 'Reset Password | Lobby',
        loadComponent: () =>
          import('./features/auth/pages/reset-password-page/reset-password-page').then(
            (component) => component.ResetPasswordPage,
          ),
      },
      {
        path: 'auth/confirm',
        pathMatch: 'full',
        redirectTo: 'confirm-email',
      },
      {
        path: 'auth/reset-password',
        pathMatch: 'full',
        redirectTo: 'reset-password',
      },
    ],
  },
  {
    path: 'guests',
    title: 'Join as Guest | Lobby',
    loadComponent: () =>
      import('./features/guests/guests-page/guests-page').then((component) => component.GuestsPage),
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
    path: 'guest/:inviteCode/call',
    title: 'Call | Lobby',
    loadComponent: () =>
      import('./features/call-room/call-room-page/call-room-page').then(
        (component) => component.CallRoomPage,
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
    path: 'friends',
    title: 'Friends | Lobby',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/friends/friends-page/friends-page').then(
        (component) => component.FriendsPage,
      ),
  },
  {
    path: 'messages',
    title: 'Messages | Lobby',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/messages/messages-page/messages-page').then(
        (component) => component.MessagesPage,
      ),
  },
  {
    path: 'messages/:friendId',
    title: 'Messages | Lobby',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/messages/messages-page/messages-page').then(
        (component) => component.MessagesPage,
      ),
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

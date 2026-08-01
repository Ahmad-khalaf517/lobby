import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Lobby',
    loadComponent: () =>
      import('./features/landing/landing-page/landing-page').then(
        (component) => component.LandingPage,
      ),
  },
  {
    path: 'login',
    title: 'Login | Lobby',
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then((component) => component.LoginPage),
  },
  {
    path: 'register',
    title: 'Register | Lobby',
    loadComponent: () =>
      import('./features/auth/register-page/register-page').then(
        (component) => component.RegisterPage,
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

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error('Lobby failed to bootstrap.', error);

  const loader = document.querySelector<HTMLElement>('.lobby-boot-loader');
  if (!loader) {
    return;
  }

  loader.classList.add('lobby-boot-loader--error');
  loader.setAttribute('role', 'alert');
  loader.setAttribute('aria-label', 'Lobby could not open');
  loader
    .querySelector<HTMLButtonElement>('.lobby-boot-error-message button')
    ?.addEventListener('click', () => window.location.reload(), { once: true });
});

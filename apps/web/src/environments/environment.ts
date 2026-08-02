/**
 * Development environment — used by `ng serve` (no `--configuration production`).
 * Empty apiUrl means every HTTP/socket call stays relative (e.g. `/channels`),
 * relying on proxy.conf.json to forward those to the local API. See
 * environment.production.ts for the deployed counterpart.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
};

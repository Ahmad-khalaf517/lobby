/**
 * Production environment — swapped in for environment.ts by the
 * `fileReplacements` entry in angular.json's "production" build
 * configuration (`ng build` / `ng build --configuration production`).
 *
 * apiUrl must be an absolute URL once apps/web and apps/api are on
 * different hosts (e.g. separate Render services) — relative paths only
 * work when a dev proxy or same-origin deploy is in front of both.
 */
export const environment = {
  production: true,
  // TODO: set this to the deployed apps/api URL (e.g. https://lobby-api.onrender.com)
  apiUrl: 'https://lobby-api-gf44.onrender.com',
};

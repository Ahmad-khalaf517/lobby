import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);
export const AUTH_RETRY_ATTEMPTED = new HttpContextToken<boolean>(() => false);
/** Set on requests that already show their own inline error UI (e.g. background polling) so the global error toast doesn't also fire. */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

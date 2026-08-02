export type AuthErrorContext =
  'login' | 'register' | 'confirmation' | 'password-recovery' | 'password-update';

const fallbackMessages: Record<AuthErrorContext, string> = {
  login: 'We could not sign you in. Please try again.',
  register: 'We could not create your account. Please try again.',
  confirmation: 'We could not confirm your email. The link may be invalid or expired.',
  'password-recovery': 'We could not send password reset instructions. Please try again.',
  'password-update': 'We could not update your password. Please try again.',
};

function readString(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const value = Reflect.get(error, key);
  return typeof value === 'string' ? value : '';
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const value = Reflect.get(error, 'status');
  return typeof value === 'number' ? value : undefined;
}

export function getAuthErrorMessage(error: unknown, context: AuthErrorContext): string {
  const message = readString(error, 'message').toLowerCase();
  const code = readString(error, 'code').toLowerCase();
  const status = readStatus(error);
  const details = `${code} ${message}`;

  if (status === 429 || /rate.?limit|too many|over_.*rate_limit/.test(details)) {
    return 'Too many attempts. Please wait before trying again.';
  }

  if (/failed to fetch|network|fetch failed|connection/.test(details)) {
    return 'We could not reach the authentication service. Check your connection and try again.';
  }

  if (/email_not_confirmed|email not confirmed/.test(details)) {
    return 'Please confirm your email before signing in.';
  }

  if (/invalid_login_credentials|invalid login credentials/.test(details)) {
    return 'The email or password you entered is incorrect.';
  }

  if (/user_already_exists|already registered|already exists/.test(details)) {
    return 'An account with this email may already exist.';
  }

  if (/weak_password|password.*(short|least|characters|requirements)/.test(details)) {
    return 'Choose a stronger password that meets the listed requirements.';
  }

  if (/otp_expired|expired/.test(details)) {
    if (context === 'password-recovery' || context === 'password-update') {
      return 'This password reset link has expired. Request a new recovery email and try again.';
    }

    return 'This confirmation link has expired. Try signing in or request a new email.';
  }

  if (/invalid.*(token|link|code)|bad_code_verifier|otp_disabled/.test(details)) {
    if (context === 'password-recovery' || context === 'password-update') {
      return 'This password reset link is invalid. Request a new recovery email and try again.';
    }

    return 'This confirmation link is invalid. Try signing in or request a new email.';
  }

  return fallbackMessages[context];
}

import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';

type ConfirmationState = 'verifying' | 'success' | 'failure' | 'missing';

interface CallbackSnapshot {
  readonly errorCode: string;
  readonly errorDescription: string;
  readonly hasAuthorizationCode: boolean;
  readonly hasImplicitCallback: boolean;
}

@Component({
  selector: 'app-confirm-email-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './confirm-email-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmailPage {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly callbackSnapshot = this.captureCallback();
  private readonly auth = inject(AuthService);

  protected readonly state = signal<ConfirmationState>('verifying');
  protected readonly failureMessage = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.verify());
  }

  private async verify(): Promise<void> {
    const callback = this.callbackSnapshot ?? this.captureCallback();

    if (!callback) {
      this.state.set('missing');
      return;
    }

    if (callback.errorCode || callback.errorDescription) {
      this.failureMessage.set(
        getAuthErrorMessage(
          { code: callback.errorCode, message: callback.errorDescription },
          'confirmation',
        ),
      );
      this.state.set('failure');
      return;
    }

    // The existing Supabase client uses its default implicit flow. It detects the
    // returned URL fragment and persists the session during client initialization.
    if (!callback.hasImplicitCallback) {
      this.state.set(callback.hasAuthorizationCode ? 'failure' : 'missing');
      return;
    }

    try {
      const { data, error } = await this.auth.getSession();

      if (error) {
        throw error;
      }

      if (!data.session) {
        this.failureMessage.set(
          'The confirmation link may be invalid or expired. Try signing in or request a new email.',
        );
        this.state.set('failure');
        return;
      }

      this.state.set('success');
    } catch (error: unknown) {
      this.failureMessage.set(getAuthErrorMessage(error, 'confirmation'));
      this.state.set('failure');
    }
  }

  private captureCallback(): CallbackSnapshot | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const search = new URLSearchParams(this.document.location.search);
    const hash = new URLSearchParams(this.document.location.hash.replace(/^#/, ''));

    return {
      errorCode: search.get('error_code') ?? hash.get('error_code') ?? search.get('error') ?? '',
      errorDescription:
        search.get('error_description') ?? hash.get('error_description') ?? hash.get('error') ?? '',
      hasAuthorizationCode: search.has('code'),
      hasImplicitCallback:
        hash.has('access_token') || hash.has('refresh_token') || hash.get('type') === 'signup',
    };
  }
}

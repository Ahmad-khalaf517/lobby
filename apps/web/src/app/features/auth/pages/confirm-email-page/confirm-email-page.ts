import { afterNextRender, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth';
import { getAuthErrorMessage } from '../../utils/auth-error.util';

type ConfirmationState = 'verifying' | 'success' | 'failure' | 'missing';

@Component({
  selector: 'app-confirm-email-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './confirm-email-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly state = signal<ConfirmationState>('verifying');
  protected readonly failureMessage = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.verify());
  }

  private async verify(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const errorCode = params.get('error_code') ?? params.get('error') ?? '';
    const errorDescription = params.get('error_description') ?? '';
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    if (errorCode || errorDescription) {
      this.failureMessage.set(
        getAuthErrorMessage({ code: errorCode, message: errorDescription }, 'confirmation'),
      );
      this.state.set('failure');
      return;
    }

    if (!tokenHash && !type) {
      this.state.set('missing');
      return;
    }

    if (!tokenHash || type !== 'email') {
      this.failureMessage.set(
        'The confirmation link is incomplete. Request a new email and try again.',
      );
      this.state.set('failure');
      return;
    }

    try {
      await this.auth.confirmEmail(tokenHash);
      this.state.set('success');
    } catch (error: unknown) {
      this.failureMessage.set(getAuthErrorMessage(error, 'confirmation'));
      this.state.set('failure');
    }
  }
}

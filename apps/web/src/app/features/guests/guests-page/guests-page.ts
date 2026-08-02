import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { type Channel, ChannelListResponseSchema, MAX_NAME_LENGTH } from '@lobby/shared';
import { environment } from '../../../../environments/environment';
import { LogoComponent } from '../../../shared/ui/logo/lobby-logo.component';

type LoadStatus = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-guests-page',
  imports: [ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './guests-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestsPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly status = signal<LoadStatus>('loading');
  protected readonly channels = signal<Channel[]>([]);

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(MAX_NAME_LENGTH)],
    }),
    channelId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor() {
    this.loadChannels();
  }

  protected loadChannels(): void {
    this.status.set('loading');
    this.http.get<unknown>(`${environment.apiUrl}/channels`).subscribe({
      next: (response) => {
        const { channels } = ChannelListResponseSchema.parse(response);
        this.channels.set(channels);
        this.status.set('loaded');
      },
      error: () => this.status.set('error'),
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { displayName, channelId } = this.form.getRawValue();
    void this.router.navigate(['/guest', channelId], { queryParams: { name: displayName } });
  }

  protected expiryLabel(channel: Channel): string {
    if (!channel.expiresAt) return 'No expiry';

    const msLeft = new Date(channel.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) return 'Expired';

    const hoursLeft = Math.round(msLeft / 3_600_000);
    if (hoursLeft < 1) return 'Expires soon';
    if (hoursLeft === 1) return '1 hour left';
    if (hoursLeft < 24) return `${hoursLeft} hours left`;

    const daysLeft = Math.round(hoursLeft / 24);
    return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  }
}

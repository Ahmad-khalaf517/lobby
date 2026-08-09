import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { DashboardStore } from '../../services/dashboard.store';

@Component({
  selector: 'app-join-server-modal',
  standalone: true,
  imports: [FormsModule, LobbyIconComponent],
  templateUrl: './join-server-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinServerModalComponent {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);

  protected readonly inviteCode = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected close(): void {
    this.store.closeModals();
    this.inviteCode.set('');
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    const trimmed = this.inviteCode().trim();
    if (!trimmed || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      const server = await this.store.joinServer(trimmed);
      this.inviteCode.set('');
      await this.router.navigate(['/app/servers', server.id]);
    } catch {
      this.error.set('Invalid or expired invite code.');
    } finally {
      this.submitting.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MAX_SERVER_NAME_LENGTH } from '@lobby/shared';

import { LobbyIconComponent } from '../../../../shared/ui/icon/lobby-icon.component';
import { DashboardStore } from '../../services/dashboard.store';
import { ServerIconComponent } from '../server-icon/server-icon.component';

@Component({
  selector: 'app-create-server-modal',
  standalone: true,
  imports: [FormsModule, LobbyIconComponent, ServerIconComponent],
  templateUrl: './create-server-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateServerModalComponent {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);

  protected readonly maxNameLength = MAX_SERVER_NAME_LENGTH;
  protected readonly name = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected close(): void {
    this.store.closeModals();
    this.name.set('');
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      const server = await this.store.createServer(trimmed);
      this.name.set('');
      await this.router.navigate(['/app/servers', server.id]);
    } catch {
      this.error.set('Could not create the server. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}

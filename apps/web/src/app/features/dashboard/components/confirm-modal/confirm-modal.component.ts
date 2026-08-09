import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  LobbyIconComponent,
  type LobbyIconName,
} from '../../../../shared/ui/icon/lobby-icon.component';

/**
 * Reusable destructive-action confirmation modal — replaces window.confirm
 * for things like deleting a channel. Purely input/output driven, same shape
 * as `app-prompt-modal`: the host owns what "confirm" actually does and
 * reports saving/error state back so the modal can stay open on failure.
 *
 * @example
 * <app-confirm-modal
 *   [open]="deleteTarget() !== null"
 *   title="Delete channel"
 *   [message]="'Delete #' + (deleteTarget()?.name ?? '') + '? This cannot be undone.'"
 *   [saving]="deleteSaving()"
 *   [errorMessage]="deleteError()"
 *   (confirm)="submitDeleteChannel()"
 *   (cancel)="deleteTarget.set(null)" />
 */
@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './confirm-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent {
  open = input(false);
  title = input('Are you sure?');
  message = input('');
  icon = input<LobbyIconName>('warning');
  confirmLabel = input('Delete');
  cancelLabel = input('Cancel');
  savingLabel = input('Deleting…');
  destructive = input(true);
  saving = input(false);
  errorMessage = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancel = output<void>();

  protected close(): void {
    if (this.saving()) return;
    this.cancel.emit();
  }

  protected submit(): void {
    if (this.saving()) return;
    this.confirmed.emit();
  }
}

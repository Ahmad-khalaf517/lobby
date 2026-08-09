import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';

/**
 * Delete action: a small trash icon button on a message's hover pill.
 *
 * By default clicking the trash emits `(delete)` with the message id
 * immediately (matching the current guest-room behavior). When `[confirm]` is
 * true, it first shows a small confirm popover.
 */
@Component({
  selector: 'app-chat-delete',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './chat-delete.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class ChatDeleteComponent {
  messageId = input.required<string>();

  /** When true, show a small confirm popover before emitting `delete`. */
  confirm = input<boolean>(false);

  /** Emitted with the message id when deletion is confirmed / triggered. */
  readonly delete = output<string>();

  /** Emitted when the user cancels the confirm popover. */
  readonly cancel = output<void>();

  protected confirmOpen = false;

  protected onTrashClick(): void {
    if (this.confirm()) {
      this.confirmOpen = !this.confirmOpen;
    } else {
      this.delete.emit(this.messageId());
    }
  }

  protected confirmDelete(): void {
    this.confirmOpen = false;
    this.delete.emit(this.messageId());
  }

  protected dismiss(): void {
    this.confirmOpen = false;
    this.cancel.emit();
  }
}

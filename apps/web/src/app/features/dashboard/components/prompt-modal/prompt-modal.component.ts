import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LobbyIconComponent,
  type LobbyIconName,
} from '../../../../shared/ui/icon/lobby-icon.component';

/**
 * Reusable single-text-field modal — replaces window.prompt/window.alert for
 * both creating and renaming an entity (a channel, a space). Purely
 * input/output driven so it can be dropped in anywhere; the host decides what
 * "save" actually does and reports back saving/error state.
 *
 * @example
 * <app-prompt-modal
 *   [open]="renameTarget() !== null"
 *   title="Rename channel"
 *   icon="hash"
 *   [initialValue]="renameTarget()?.name ?? ''"
 *   [saving]="renameSaving()"
 *   [errorMessage]="renameError()"
 *   (save)="submitRename($event)"
 *   (cancel)="renameTarget.set(null)" />
 */
@Component({
  selector: 'app-prompt-modal',
  standalone: true,
  imports: [FormsModule, LobbyIconComponent],
  templateUrl: './prompt-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptModalComponent {
  open = input(false);
  title = input('Rename');
  subtitle = input<string | null>(null);
  label = input('Name');
  icon = input<LobbyIconName>('edit');
  initialValue = input('');
  placeholder = input('');
  maxLength = input(100);
  saving = input(false);
  errorMessage = input<string | null>(null);
  confirmLabel = input('Save changes');
  savingLabel = input('Saving…');

  readonly save = output<string>();
  readonly cancel = output<void>();

  protected readonly value = signal('');
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.value.set(this.initialValue());
      queueMicrotask(() => {
        const element = this.nameInputRef()?.nativeElement;
        element?.focus();
        element?.select();
      });
    });
  }

  protected close(): void {
    if (this.saving()) return;
    this.cancel.emit();
  }

  protected submit(): void {
    if (this.saving()) return;
    const trimmed = this.value().trim();
    if (!trimmed) return;
    this.save.emit(trimmed);
  }
}

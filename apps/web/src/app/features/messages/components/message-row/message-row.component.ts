import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { PersonAvatarComponent } from '../../../../shared/components/person-avatar/person-avatar.component';
import {
  ChatReactComponent,
  DEFAULT_CHAT_EMOJIS,
  type ChatMessage,
} from '../../../../shared/components/room-chat';
import { authorToPerson, formatMessageTime } from '../../messages.util';

/**
 * A single direct-message row, matching the mockup's message-actions design:
 * avatar, author + time (+ "(edited)"), an optional reply quote, the message
 * text, and a hover toolbar (react / reply / edit / delete). Own messages also
 * support inline editing (Enter = save, Escape = cancel) and a confirm popover
 * for deletion.
 *
 * Presentational — the parent owns the data and the editing / reaction-menu
 * state; this component only reports intent through outputs.
 */
@Component({
  selector: 'app-message-row',
  standalone: true,
  imports: [PersonAvatarComponent, ChatReactComponent],
  templateUrl: './message-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group relative flex w-full gap-3 rounded-xl px-2 py-2 transition hover:bg-[#141821]',
  },
})
export class MessageRowComponent {
  message = input.required<ChatMessage>();

  /** Used to detect own messages (edit / delete + author styling). */
  currentUserId = input.required<string>();

  /** Whether this row is in edit mode (parent-controlled, one at a time). */
  editing = input<boolean>(false);

  /** Whether this row's reaction popover is open (parent-controlled). */
  reactionMenuOpen = input<boolean>(false);

  /** Emoji set for the reaction picker popover. */
  emojis = input<string[]>(DEFAULT_CHAT_EMOJIS);

  /** Emitted when the reply icon is clicked. */
  readonly reply = output<ChatMessage>();

  /** Emitted when the pencil icon is clicked. */
  readonly edit = output<ChatMessage>();

  /** Emitted with the new text when the user saves an edit (Enter). */
  readonly saveEdit = output<{ messageId: string; text: string }>();

  /** Emitted when the user cancels an edit (Escape). */
  readonly cancelEdit = output<void>();

  /** Emitted with the message id once deletion is confirmed. */
  readonly deleteMessage = output<string>();

  /** Emitted when an emoji is picked from the popover or a chip is toggled. */
  readonly react = output<{ messageId: string; emoji: string }>();

  /** Emitted when the smile icon is clicked, with the message id. */
  readonly toggleReactionMenu = output<string>();

  protected readonly isOwn = computed(() => this.message().author.id === this.currentUserId());
  protected readonly authorPerson = computed(() => authorToPerson(this.message().author));
  protected readonly time = computed(() => formatMessageTime(this.message().createdAt));

  protected readonly editDraft = signal('');
  protected readonly deleteConfirmOpen = signal(false);

  private readonly editInput = viewChild<ElementRef<HTMLTextAreaElement>>('editInput');
  private wasEditing = false;

  constructor() {
    effect(() => {
      const isEditing = this.editing();
      if (isEditing && !this.wasEditing) {
        this.editDraft.set(this.message().text);
      }
      this.wasEditing = isEditing;
      if (isEditing) {
        queueMicrotask(() => this.editInput()?.nativeElement.focus());
      }
    });
  }

  protected onReply(): void {
    this.reply.emit(this.message());
  }

  protected onEdit(): void {
    this.edit.emit(this.message());
  }

  protected onReact(emoji: string): void {
    this.react.emit({ messageId: this.message().id, emoji });
  }

  protected onReactFromChips(payload: { messageId: string; emoji: string }): void {
    this.react.emit(payload);
  }

  protected onToggleReactionMenu(): void {
    this.toggleReactionMenu.emit(this.message().id);
  }

  protected onDelete(): void {
    this.deleteMessage.emit(this.message().id);
  }

  protected onEditInput(event: Event): void {
    this.editDraft.set((event.target as HTMLTextAreaElement).value);
  }

  protected saveEditDraft(): void {
    this.saveEdit.emit({ messageId: this.message().id, text: this.editDraft() });
  }

  protected cancelEditDraft(): void {
    this.cancelEdit.emit();
  }

  protected toggleDeleteConfirm(): void {
    this.deleteConfirmOpen.update((open) => !open);
  }

  protected confirmDelete(): void {
    this.deleteConfirmOpen.set(false);
    this.onDelete();
  }

  protected dismissDelete(): void {
    this.deleteConfirmOpen.set(false);
  }
}

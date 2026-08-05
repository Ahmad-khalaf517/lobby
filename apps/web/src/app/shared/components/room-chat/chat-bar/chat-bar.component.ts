import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAX_MESSAGE_LENGTH } from '@lobby/shared';
import { ChatAvatarComponent } from '../chat-avatar/chat-avatar.component';
import { DEFAULT_CHAT_EMOJIS } from '../models/chat-message.model';

/**
 * Bottom input bar: text input with @mention suggestions and an emoji picker,
 * plus the Send button. Owns the composer FormControl; emits the trimmed text
 * via `(send)` and resets itself. The parent decides what to do with the text
 * and controls whether sending is allowed via `[disabled]`.
 */
@Component({
  selector: 'app-chat-bar',
  standalone: true,
  imports: [ReactiveFormsModule, ChatAvatarComponent],
  templateUrl: './chat-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class ChatBarComponent {
  placeholder = input<string>('Message the room');
  disabled = input<boolean>(false);
  maxLength = input<number>(MAX_MESSAGE_LENGTH);
  memberNames = input<string[]>([]);
  emojis = input<string[]>(DEFAULT_CHAT_EMOJIS);

  /** Emitted with the trimmed message text when the user hits Send. */
  readonly send = output<string>();

  private readonly composerInput = viewChild<ElementRef<HTMLInputElement>>('composerInput');
  private readonly emojiPickerHost = viewChild<ElementRef<HTMLElement>>('emojiPickerHost');

  protected readonly control = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_MESSAGE_LENGTH)],
  });

  protected readonly emojiPickerOpen = signal(false);
  protected readonly mentionQuery = signal<string | null>(null);
  protected readonly mentionHighlightIndex = signal(0);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.disabled() || this.control.invalid) {
      this.control.markAsTouched();
      return;
    }

    this.send.emit(this.control.value.trim());
    this.control.reset('');
    this.emojiPickerOpen.set(false);
    this.mentionQuery.set(null);
  }

  protected canSend(): boolean {
    return !this.disabled() && this.control.valid;
  }

  protected onComposerInput(): void {
    const input = this.composerInput()?.nativeElement;
    if (!input) return;

    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);

    this.mentionQuery.set(match ? match[1] : null);
    if (match) {
      this.mentionHighlightIndex.set(0);
    }
  }

  protected mentionSuggestions(): Array<{ name: string; kind: 'all' | 'member' }> {
    const query = this.mentionQuery();
    if (query === null) return [];

    const normalized = query.trim().toLocaleLowerCase();
    const members = this.memberNames()
      .filter((name) => !normalized || name.trim().toLocaleLowerCase().includes(normalized))
      .map((name) => ({ name: name.trim(), kind: 'member' as const }));
    const results: Array<{ name: string; kind: 'all' | 'member' }> = [...members];

    if (!normalized || 'all'.includes(normalized)) {
      results.unshift({ name: 'all', kind: 'all' });
    }

    return results.slice(0, 8);
  }

  protected insertMention(name: string): void {
    const input = this.composerInput()?.nativeElement;
    if (!input) return;

    const value = input.value;
    const caret = input.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@[\p{L}\p{N}_]*$/u);
    const mentionStart = match ? match.index! + match[0].indexOf('@') : caret;
    const mention = `@${name} `;

    this.control.setValue(value.slice(0, mentionStart) + mention + value.slice(caret));
    this.mentionQuery.set(null);

    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(mentionStart + mention.length, mentionStart + mention.length);
    });
  }

  protected onMentionKeydown(event: KeyboardEvent): void {
    if (this.mentionQuery() === null) return;

    const suggestions = this.mentionSuggestions();
    if (suggestions.length === 0) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const index = Math.min(this.mentionHighlightIndex(), suggestions.length - 1);
      this.insertMention(suggestions[index].name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.mentionQuery.set(null);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.mentionHighlightIndex.update((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.mentionHighlightIndex.update(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    }
  }

  protected onComposerBlur(): void {
    this.mentionQuery.set(null);
  }

  protected toggleEmojiPicker(): void {
    this.emojiPickerOpen.update((open) => !open);
  }

  protected selectEmoji(emoji: string): void {
    const input = this.composerInput()?.nativeElement;
    const current = this.control.value;

    if (!input) {
      this.control.setValue(`${current}${emoji}`);
      this.emojiPickerOpen.set(false);
      return;
    }

    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const nextValue = `${current.slice(0, start)}${emoji}${current.slice(end)}`;

    this.control.setValue(nextValue);
    this.emojiPickerOpen.set(false);

    queueMicrotask(() => {
      input.focus();
      const cursor = start + emoji.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

  /** Public: move focus to the composer input (used when starting a reply). */
  focusInput(): void {
    this.composerInput()?.nativeElement.focus();
  }

  /** Public: close the emoji picker + mention dropdown (used when starting a reply). */
  closePopovers(): void {
    this.emojiPickerOpen.set(false);
    this.mentionQuery.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    const host = this.emojiPickerHost()?.nativeElement;
    if (this.emojiPickerOpen() && target instanceof Node && host && !host.contains(target)) {
      this.emojiPickerOpen.set(false);
    }
  }
}

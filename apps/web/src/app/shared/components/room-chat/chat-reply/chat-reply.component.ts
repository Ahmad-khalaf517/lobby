import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import type { ChatMessage, ChatReplyPreview } from '../models/chat-message.model';

/**
 * Reply UI, used in two spots:
 *
 * 1. On a message (hover actions): a small reply icon button. Pass `[message]`
 *    and listen for `(reply)`.
 * 2. Above the composer: the "Replying to …" banner with a cancel button.
 *    Pass `[preview]` and listen for `(cancelReply)`.
 *
 * Exactly one role renders at a time — `preview` wins when set.
 */
@Component({
  selector: 'app-chat-reply',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './chat-reply.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class ChatReplyComponent {
  /** When set, renders the "Replying to …" banner above the composer. */
  preview = input<ChatReplyPreview | null>(null);

  /** When set (and no preview), renders the small reply icon button on a message. */
  message = input<ChatMessage | null>(null);

  /**
   * Set when the composer this sits above is its own rounded/bordered box
   * (e.g. the DMs page) — renders as a plain top section of that box instead
   * of a second, independently-boxed banner floating above it.
   */
  docked = input(false);

  /** Emitted when the reply icon is clicked, with the message being replied to. */
  readonly reply = output<ChatMessage>();

  /** Emitted when the user cancels the active reply preview. */
  readonly cancelReply = output<void>();

  protected onReply(): void {
    const message = this.message();
    if (message) {
      this.reply.emit(message);
    }
  }
}

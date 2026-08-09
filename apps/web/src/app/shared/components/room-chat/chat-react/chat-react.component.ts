import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { DEFAULT_CHAT_EMOJIS, type ChatMessage } from '../models/chat-message.model';

export type ChatReactMode = 'action' | 'chips';

/**
 * Reactions, used in two spots:
 *
 * 1. `mode="action"` — the small smile icon on a message's hover pill plus the
 *    emoji popover. The button emits `(toggleMenu)` with the message id; the
 *    parent decides whether the popover is open via `[menuOpen]`. Picking an
 *    emoji (or clicking a chip) emits `(react)` with `{ messageId, emoji }`.
 * 2. `mode="chips"` — the aggregated reaction chips under a message.
 *
 * The host is `display: contents`, so the button joins its parent's flex row
 * and the popover positions itself against the nearest positioned ancestor
 * (the message bubble container) — identical to the original markup.
 */
@Component({
  selector: 'app-chat-react',
  standalone: true,
  imports: [LobbyIconComponent],
  templateUrl: './chat-react.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "'contents'",
  },
})
export class ChatReactComponent {
  message = input.required<ChatMessage>();

  /** `action` = hover icon + popover; `chips` = aggregate chips under the message. */
  mode = input<ChatReactMode>('action');

  /** Action mode only: whether the emoji popover is currently open. */
  menuOpen = input<boolean>(false);

  /** Emoji set for the picker popover. */
  emojis = input<string[]>(DEFAULT_CHAT_EMOJIS);

  /** Action mode only: emitted when the smile icon is clicked, with the message id. */
  readonly toggleMenu = output<string>();

  /** Emitted when an emoji is picked/chipped, with the message id + emoji. */
  readonly react = output<{ messageId: string; emoji: string }>();

  protected onToggleMenu(): void {
    this.toggleMenu.emit(this.message().id);
  }

  protected onReact(emoji: string): void {
    this.react.emit({ messageId: this.message().id, emoji });
  }
}

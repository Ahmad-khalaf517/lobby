import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LobbyIconComponent } from '../../../ui/icon/lobby-icon.component';
import { ChatAvatarComponent } from '../chat-avatar/chat-avatar.component';
import { ChatDeleteComponent } from '../chat-delete/chat-delete.component';
import { ChatReactComponent } from '../chat-react/chat-react.component';
import { ChatReplyComponent } from '../chat-reply/chat-reply.component';
import type { ChatMessage } from '../models/chat-message.model';

export type ParsedReply = { authorName: string; previewText: string; bodyText: string };

/**
 * A single message bubble: avatar, author name, "You" tag, timestamp, text
 * (with @mention chips), an inline reply-quote when the message is a reply,
 * hover actions (reply / react / delete) and reaction chips.
 *
 * Presentational only — all data comes in via inputs and actions go out via
 * outputs. The parent (via room-chat) owns the actual state.
 */
@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [
    LobbyIconComponent,
    ChatAvatarComponent,
    ChatReplyComponent,
    ChatReactComponent,
    ChatDeleteComponent,
  ],
  templateUrl: './chat-message.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group flex w-full items-start gap-2.5',
    '[class.flex-row-reverse]': 'isOwn()',
  },
})
export class ChatMessageComponent {
  message = input.required<ChatMessage>();

  /** Used to detect own messages (`message.author.id === currentUserId`). */
  currentUserId = input<string>('');

  /** Member names used to highlight @member mentions. */
  memberNames = input<string[]>([]);

  /** Whether this message's reaction picker popover is open (parent-controlled). */
  reactionMenuOpen = input<boolean>(false);

  /** Emitted when the reply icon is clicked. */
  readonly reply = output<ChatMessage>();

  /** Emitted when the react icon is clicked, with the message id. */
  readonly toggleReactionMenu = output<string>();

  /** Emitted when an emoji is picked or a chip is toggled. */
  readonly react = output<{ messageId: string; emoji: string }>();

  /** Emitted with the message id when deletion is confirmed / triggered. */
  readonly delete = output<string>();
  readonly edit = output<ChatMessage>();

  protected readonly isOwn = computed(() => this.message().author.id === this.currentUserId());

  protected readonly parsedReply = computed<ParsedReply | null>(() => {
    const reply = this.message().reply;
    return reply
      ? { authorName: reply.authorName, previewText: reply.text, bodyText: this.message().text }
      : parseReplyMessage(this.message().text);
  });

  protected onReply(): void {
    this.reply.emit(this.message());
  }

  protected onToggleReactionMenu(): void {
    this.toggleReactionMenu.emit(this.message().id);
  }

  protected onReact(payload: { messageId: string; emoji: string }): void {
    this.react.emit(payload);
  }

  protected onDelete(messageId: string): void {
    this.delete.emit(messageId);
  }

  protected onEdit(): void {
    this.edit.emit(this.message());
  }

  protected chipClass(isAll: boolean): string {
    const base = `mx-0.5 inline-block rounded px-1${isAll ? ' font-semibold' : ''}`;
    const style = isAll
      ? this.isOwn()
        ? 'bg-white/25 text-white'
        : 'bg-[#8f74ff] text-white'
      : this.isOwn()
        ? 'bg-white/25 text-white'
        : 'bg-[#8f74ff]/25 text-[#e2dcff]';
    return `${base} ${style}`;
  }

  protected mentionParts(text: string): Array<{ text: string; kind: 'all' | 'member' | 'text' }> {
    const names = Array.from(
      new Set(
        this.memberNames()
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => b.length - a.length);
    const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = ['@(?:all|everyone)\\b'];
    if (names.length > 0) {
      patterns.push(`@(?:${names.map(escapeRegExp).join('|')})(?=\\s|$)`);
    }
    patterns.push('@[\\p{L}\\p{N}_]+');
    const matcher = new RegExp(patterns.join('|'), 'giu');

    const parts: Array<{ text: string; kind: 'all' | 'member' | 'text' }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(text)) !== null) {
      const index = match.index;
      if (index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, index), kind: 'text' });
      }
      const matched = match[0].slice(1).toLocaleLowerCase();
      parts.push({
        text: match[0],
        kind: matched === 'all' || matched === 'everyone' ? 'all' : 'member',
      });
      lastIndex = index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), kind: 'text' });
    }

    return parts;
  }

  protected messageTime(message: ChatMessage): string {
    return new Date(message.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/** Parse the `↪ Reply to X: preview\nbody` wire format produced by room-chat on reply. */
function parseReplyMessage(text: string): ParsedReply | null {
  const match = text.match(/^↪ Reply to (.+?): (.*)\n([\s\S]+)$/);
  if (!match) {
    return null;
  }

  const [, authorName, previewText, bodyText] = match;
  return { authorName, previewText, bodyText };
}

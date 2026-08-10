import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ChatMessage, SendChatMessage } from '../../../shared/components/room-chat';
import { RoomChatComponent } from '../../../shared/components/room-chat';
import { LoadingStateComponent } from '../../../shared/ui/loading-state/loading-state.component';
import { ChannelChatStore } from '../services/channel-chat.store';

/**
 * Temporary authenticated-channel presentation adapter. The store owns all
 * persistence, authorization-facing requests, Realtime, and lifecycle state;
 * this component only adapts that state to the reusable RoomChatComponent.
 */
@Component({
  selector: 'app-channel-chat-panel',
  standalone: true,
  imports: [RoomChatComponent, LoadingStateComponent],
  templateUrl: './channel-chat-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
})
export class ChannelChatPanel {
  protected readonly chat = inject(ChannelChatStore);

  title = input('Channel');
  subtitle = input('');
  contextLabel = input('');
  placeholder = input('Message the channel');
  currentUserId = input('');
  memberNames = input<string[]>([]);
  showHeader = input(true);
  showCloseButton = input(false);
  readonly close = output<void>();

  protected readonly mentionNames = computed(() => [
    ...new Set([...this.memberNames(), ...this.chat.memberNames()]),
  ]);

  protected send(message: SendChatMessage): void {
    void this.chat.send(message).catch(() => undefined);
  }

  protected edit(message: ChatMessage): void {
    if (typeof window === 'undefined') return;
    const content = window.prompt('Edit message', message.text)?.trim();
    if (!content || content === message.text) return;
    void this.chat.editMessage(message.id, content).catch(() => undefined);
  }

  protected remove(messageId: string): void {
    void this.chat.deleteMessage(messageId).catch(() => undefined);
  }

  protected react(payload: { messageId: string; emoji: string }): void {
    void this.chat.toggleReaction(payload.messageId, payload.emoji).catch(() => undefined);
  }

  protected loadOlder(): void {
    void this.chat.loadOlder().catch(() => undefined);
  }

  protected retry(): void {
    void this.chat.retry().catch(() => undefined);
  }

  protected retryFailedSends(): void {
    void this.chat.retryFailedSends();
  }
}

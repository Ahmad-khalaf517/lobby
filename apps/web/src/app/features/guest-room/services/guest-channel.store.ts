import { computed, inject, Injectable, signal } from '@angular/core';
import type { PostgrestError, RealtimeChannel } from '@supabase/supabase-js';

import type { ChatMessage, ChatUser, SendChatMessage } from '../../../shared/components/room-chat';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';
import type {
  GuestChannel,
  GuestChannelMember,
  GuestMessage,
  GuestMessageReaction,
} from '../../../core/supabase/database.types';
import { AuthService } from '../../auth/services/auth';
import {
  aggregateReactions,
  mergeMessages,
  reactionKey,
  sortMessages,
} from './guest-channel.utils';

export type GuestRestoreResult = 'restored' | 'needs-name';

@Injectable({ providedIn: 'root' })
export class GuestChannelStore {
  private readonly auth = inject(AuthService);
  private readonly supabaseSession = inject(SupabaseSessionService);
  private readonly guest = this.supabaseSession.client.schema('guest');

  private readonly _channel = signal<GuestChannel | null>(null);
  private readonly _currentMember = signal<GuestChannelMember | null>(null);
  private readonly _members = signal<GuestChannelMember[]>([]);
  private readonly _messages = signal<GuestMessage[]>([]);
  private readonly _reactions = signal<GuestMessageReaction[]>([]);
  private readonly _pendingMessages = signal<ChatMessage[]>([]);
  private readonly _loading = signal(false);
  private readonly _initialized = signal(false);
  private readonly _connected = signal(false);
  private readonly _error = signal<string | null>(null);
  private realtimeChannel: RealtimeChannel | null = null;

  readonly channel = this._channel.asReadonly();
  readonly currentMember = this._currentMember.asReadonly();
  readonly members = computed(() =>
    this._members().filter((member) => member.left_at === null && member.removed_at === null),
  );
  readonly messages = this._messages.asReadonly();
  readonly reactions = this._reactions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly error = this._error.asReadonly();
  readonly ended = computed(() => {
    const channel = this._channel();
    return (
      channel !== null &&
      (channel.status !== 'active' || Date.parse(channel.expires_at) <= Date.now())
    );
  });
  readonly isOwner = computed(() => this._channel()?.owner_member_id === this._currentMember()?.id);
  readonly displayName = computed(() => this._currentMember()?.display_name ?? '');
  readonly currentUser = computed<ChatUser>(() => ({
    id: this._currentMember()?.id ?? '',
    name: this.displayName(),
  }));
  readonly memberNames = computed(() => this.members().map((member) => member.display_name));
  readonly chatMessages = computed<ChatMessage[]>(() => {
    const persisted = this._messages().map((message) => this.toChatMessage(message));
    return [...persisted, ...this._pendingMessages()].sort(compareChatMessages);
  });

  async restore(inviteCode: string): Promise<GuestRestoreResult> {
    await this.auth.initialize();
    if (this.auth.status() !== 'anonymous' && this.auth.status() !== 'authenticated') {
      return 'needs-name';
    }

    const normalizedCode = inviteCode.trim().toUpperCase();
    const currentChannel = this._channel();
    const currentMember = this._currentMember();
    const currentStateIsReusable =
      this._initialized() &&
      currentChannel?.code === normalizedCode &&
      currentChannel.status === 'active' &&
      Date.parse(currentChannel.expires_at) > Date.now() &&
      currentMember !== null &&
      currentMember.left_at === null &&
      currentMember.removed_at === null;

    if (currentStateIsReusable) {
      return 'restored';
    }

    this._loading.set(true);
    this._error.set(null);
    try {
      const { data, error } = await this.guest
        .from('channels')
        .select()
        .eq('code', normalizedCode)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        await this.load(data.id);
        return 'restored';
      }

      if (this.auth.status() === 'authenticated') {
        await this.join(normalizedCode);
        return 'restored';
      }

      return 'needs-name';
    } finally {
      this._loading.set(false);
    }
  }

  async join(inviteCode: string, displayName?: string): Promise<string> {
    await this.auth.ensureGuestSession();
    const data = await this.rpc(() =>
      this.guest.rpc('join_channel', {
        p_code: inviteCode.trim().toUpperCase(),
        ...(this.auth.status() === 'anonymous' ? { p_display_name: displayName } : {}),
      }),
    );
    const result = data[0];
    if (!result) throw new Error('The guest channel did not return a membership.');
    await this.load(result.channel_id);
    return result.channel_id;
  }

  async create(name: string, displayName?: string): Promise<{ channelId: string; code: string }> {
    await this.auth.ensureGuestSession();
    const data = await this.rpc(() =>
      this.guest.rpc('create_channel', {
        p_name: name.trim(),
        ...(this.auth.status() === 'anonymous' ? { p_display_name: displayName } : {}),
      }),
    );
    const result = data[0];
    if (!result) throw new Error('The guest channel was not created.');
    await this.load(result.channel_id);
    return { channelId: result.channel_id, code: result.code };
  }

  async send(message: SendChatMessage): Promise<void> {
    const channel = this.requireChannel();
    const member = this.requireMember();
    const clientMessageId = crypto.randomUUID();
    const pendingId = `pending:${clientMessageId}`;
    const pending: ChatMessage = {
      id: pendingId,
      author: { id: member.id, name: member.display_name },
      text: message.text,
      createdAt: new Date().toISOString(),
      reactions: [],
      ownReaction: null,
      reply: this.replyPreview(message.replyTo),
      edited: false,
      deleted: false,
      pending: true,
      failed: false,
    };
    this._pendingMessages.update((current) => [...current, pending]);

    try {
      const row = await this.rpc(() =>
        this.guest.rpc('create_message', {
          p_channel_id: channel.id,
          p_content: message.text,
          p_client_message_id: clientMessageId,
          ...(message.replyTo ? { p_reply_to: message.replyTo } : {}),
        }),
      );
      this.upsertMessage(row);
      this._pendingMessages.update((current) => current.filter((item) => item.id !== pendingId));
    } catch (error: unknown) {
      this._pendingMessages.update((current) =>
        current.map((item) =>
          item.id === pendingId ? { ...item, pending: false, failed: true } : item,
        ),
      );
      throw error;
    }
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const row = await this.rpc(() =>
      this.guest.rpc('edit_message', {
        p_channel_id: this.requireChannel().id,
        p_message_id: messageId,
        p_content: content.trim(),
      }),
    );
    this.upsertMessage(row);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const row = await this.rpc(() =>
      this.guest.rpc('delete_message', {
        p_channel_id: this.requireChannel().id,
        p_message_id: messageId,
      }),
    );
    this.upsertMessage(row);
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const channelId = this.requireChannel().id;
    const memberId = this.requireMember().id;
    const added = await this.rpc(() =>
      this.guest.rpc('toggle_message_reaction', {
        p_channel_id: channelId,
        p_message_id: messageId,
        p_emoji: emoji,
      }),
    );

    if (added) {
      this.upsertReaction({
        channel_id: channelId,
        message_id: messageId,
        member_id: memberId,
        emoji,
        created_at: new Date().toISOString(),
      });
    } else {
      this.removeReaction({
        channel_id: channelId,
        message_id: messageId,
        member_id: memberId,
        emoji,
        created_at: '',
      });
    }
  }

  async leave(): Promise<void> {
    const channel = this._channel();
    if (channel && this._currentMember()) {
      await this.rpcVoid(() => this.guest.rpc('leave_channel', { p_channel_id: channel.id }));
    }
    await this.cleanup();
  }

  async close(): Promise<void> {
    const channel = this.requireChannel();
    await this.rpcVoid(() => this.guest.rpc('close_channel', { p_channel_id: channel.id }));
  }

  async kickMember(memberId: string, reason?: string): Promise<GuestChannelMember> {
    const row = await this.rpc(() =>
      this.guest.rpc('kick_channel_member', {
        p_channel_id: this.requireChannel().id,
        p_member_id: memberId,
        ...(reason ? { p_reason: reason } : {}),
      }),
    );
    this.upsertMember(row);
    return row;
  }

  async blockMember(memberId: string, reason?: string): Promise<GuestChannelMember> {
    const row = await this.rpc(() =>
      this.guest.rpc('block_channel_member', {
        p_channel_id: this.requireChannel().id,
        p_member_id: memberId,
        ...(reason ? { p_reason: reason } : {}),
      }),
    );
    this.upsertMember(row);
    return row;
  }

  async cleanup(): Promise<void> {
    if (this.realtimeChannel) {
      await this.supabaseSession.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this._channel.set(null);
    this._currentMember.set(null);
    this._members.set([]);
    this._messages.set([]);
    this._reactions.set([]);
    this._pendingMessages.set([]);
    this._connected.set(false);
    this._initialized.set(false);
    this._error.set(null);
  }

  private async load(channelId: string): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Authentication is required.');

    this._loading.set(true);
    this._error.set(null);
    try {
      const [channelResult, memberResult, membersResult, messagesResult, reactionsResult] =
        await Promise.all([
          this.guest.from('channels').select().eq('id', channelId).single(),
          this.guest
            .from('channel_members')
            .select()
            .eq('channel_id', channelId)
            .eq('user_id', user.id)
            .is('left_at', null)
            .is('removed_at', null)
            .single(),
          this.guest
            .from('channel_members')
            .select()
            .eq('channel_id', channelId)
            .order('joined_at'),
          this.guest
            .from('messages')
            .select()
            .eq('channel_id', channelId)
            .order('created_at')
            .limit(100),
          this.guest.from('message_reactions').select().eq('channel_id', channelId),
        ]);

      const firstError = [
        channelResult.error,
        memberResult.error,
        membersResult.error,
        messagesResult.error,
        reactionsResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;
      if (!channelResult.data || !memberResult.data)
        throw new Error('Active channel membership was not found.');

      this._channel.set(channelResult.data);
      this._currentMember.set(memberResult.data);
      this._members.set(membersResult.data ?? []);
      this._messages.set(sortMessages(messagesResult.data ?? []));
      this._reactions.set(reactionsResult.data ?? []);
      this._initialized.set(true);
      this.subscribe(channelId);
    } catch (error: unknown) {
      this._error.set(describeError(error));
      throw error;
    } finally {
      this._loading.set(false);
    }
  }

  private subscribe(channelId: string): void {
    if (this.realtimeChannel) void this.supabaseSession.client.removeChannel(this.realtimeChannel);

    const channel = this.supabaseSession.client
      .channel(`guest:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'guest', table: 'channels', filter: `id=eq.${channelId}` },
        (payload) => {
          if (isGuestChannel(payload.new)) {
            this._channel.set(payload.new);
            if (payload.new.status !== 'active') this._connected.set(false);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'guest',
          table: 'channel_members',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (isGuestChannelMember(payload.new)) this.upsertMember(payload.new);
          if (payload.eventType === 'DELETE' && isGuestChannelMember(payload.old)) {
            this._members.update((members) =>
              members.filter((member) => member.id !== payload.old['id']),
            );
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'guest', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (isGuestMessage(payload.new)) this.upsertMessage(payload.new);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'guest',
          table: 'message_reactions',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE' && isGuestMessageReaction(payload.old))
            this.removeReaction(payload.old);
          else if (isGuestMessageReaction(payload.new)) this.upsertReaction(payload.new);
        },
      )
      .subscribe((status, error) => {
        this._connected.set(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this._error.set(error?.message ?? 'Realtime connection failed.');
        }
      });

    this.realtimeChannel = channel;
  }

  private toChatMessage(message: GuestMessage): ChatMessage {
    const author = this._members().find((member) => member.id === message.sender_member_id);
    const reactions = aggregateReactions(
      this._reactions().filter((reaction) => reaction.message_id === message.id),
      this._currentMember()?.id ?? null,
    );
    return {
      id: message.id,
      author: { id: author?.id ?? 'system', name: author?.display_name ?? 'System' },
      text: message.deleted_at ? 'This message was deleted.' : message.content,
      createdAt: message.created_at,
      reactions: message.deleted_at ? [] : reactions,
      ownReaction: reactions.find((reaction) => reaction.reactedByMe)?.emoji ?? null,
      reply: this.replyPreview(message.reply_to),
      edited: message.edited_at !== null,
      deleted: message.deleted_at !== null,
      pending: false,
      failed: false,
    };
  }

  private replyPreview(messageId: string | null): ChatMessage['reply'] {
    if (!messageId) return null;
    const target = this._messages().find((message) => message.id === messageId);
    if (!target) return null;
    const author = this._members().find((member) => member.id === target.sender_member_id);
    return {
      messageId,
      authorName: author?.display_name ?? 'Unknown',
      text: target.deleted_at ? 'Deleted message' : target.content,
    };
  }

  private upsertMessage(row: GuestMessage): void {
    this._messages.update((messages) => mergeMessages(messages, row));
    if (row.client_message_id) {
      this._pendingMessages.update((messages) =>
        messages.filter((message) => message.id !== `pending:${row.client_message_id}`),
      );
    }
  }

  private upsertMember(row: GuestChannelMember): void {
    this._members.update((members) => [...members.filter((member) => member.id !== row.id), row]);
    if (row.id === this._currentMember()?.id) this._currentMember.set(row);
  }

  private upsertReaction(row: GuestMessageReaction): void {
    this._reactions.update((reactions) => [
      ...reactions.filter((reaction) => reactionKey(reaction) !== reactionKey(row)),
      row,
    ]);
  }

  private removeReaction(row: GuestMessageReaction): void {
    this._reactions.update((reactions) =>
      reactions.filter((reaction) => reactionKey(reaction) !== reactionKey(row)),
    );
  }

  private requireChannel(): GuestChannel {
    const channel = this._channel();
    if (!channel || channel.status !== 'active')
      throw new Error('The guest channel is no longer active.');
    return channel;
  }

  private requireMember(): GuestChannelMember {
    const member = this._currentMember();
    if (!member || member.left_at || member.removed_at)
      throw new Error('Active channel membership is required.');
    return member;
  }

  private async rpc<T>(
    operation: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  ): Promise<T> {
    let result = await operation();
    if (result.error && isAuthError(result.error)) {
      await this.auth.refreshSession();
      result = await operation();
    }
    if (result.error) {
      this._error.set(describeError(result.error));
      throw result.error;
    }
    if (result.data === null) throw new Error('Supabase returned no data.');
    return result.data;
  }

  private async rpcVoid(
    operation: () => PromiseLike<{ error: PostgrestError | null }>,
  ): Promise<void> {
    let result = await operation();
    if (result.error && isAuthError(result.error)) {
      await this.auth.refreshSession();
      result = await operation();
    }
    if (result.error) throw result.error;
  }
}

function compareChatMessages(left: ChatMessage, right: ChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGuestChannel(value: unknown): value is GuestChannel {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['code'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['status'] === 'string' &&
    typeof value['expires_at'] === 'string' &&
    typeof value['livekit_room_name'] === 'string'
  );
}

function isGuestChannelMember(value: unknown): value is GuestChannelMember {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['channel_id'] === 'string' &&
    typeof value['user_id'] === 'string' &&
    typeof value['display_name'] === 'string' &&
    typeof value['livekit_identity'] === 'string'
  );
}

function isGuestMessage(value: unknown): value is GuestMessage {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['channel_id'] === 'string' &&
    typeof value['content'] === 'string' &&
    typeof value['created_at'] === 'string' &&
    typeof value['updated_at'] === 'string'
  );
}

function isGuestMessageReaction(value: unknown): value is GuestMessageReaction {
  return (
    isRecord(value) &&
    typeof value['channel_id'] === 'string' &&
    typeof value['message_id'] === 'string' &&
    typeof value['member_id'] === 'string' &&
    typeof value['emoji'] === 'string' &&
    typeof value['created_at'] === 'string'
  );
}

function isAuthError(error: PostgrestError): boolean {
  return error.code === 'PGRST301' || /jwt|token|auth/i.test(error.message);
}

function describeError(error: unknown): string {
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return error instanceof Error ? error.message : 'The guest channel request failed.';
}

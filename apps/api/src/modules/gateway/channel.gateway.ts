import { NotFoundException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  ChatMessagePayloadSchema,
  JoinChannelPayloadSchema,
  LeaveChannelPayloadSchema,
  SOCKET_EVENTS,
  TypingPayloadSchema,
  type Member,
} from '@lobby/shared';
import { ChannelsService } from '../channels/channels.service';

/**
 * cors: { origin: true } reflects whatever Origin the client sent (including
 * `null`, which is what a page opened via file:// sends — e.g.
 * shipped/socket-dev-console.html). This is intentionally more permissive
 * than main.ts's HTTP-level enableCors(CORS_ORIGIN): sockets never carry the
 * Supabase service-role key, and "knowing the channel id" is already this
 * app's access-control model. Tighten to CORS_ORIGIN once apps/web (not the
 * dev console) is the only real client.
 */
@WebSocketGateway({ cors: { origin: true } })
export class ChannelGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  /**
   * channelId -> (socketId -> { name, memberId }). Live presence (who's
   * connected *right now*) is still in-memory only (see
   * docs/PROJECT_PLAN.md risk #5) — this map is the source of truth for
   * that. `memberId` is the persisted `channel_members` row opened on join,
   * used to attribute chat messages without trusting a free-text name on
   * every single payload.
   */
  private readonly channelMembers = new Map<
    string,
    Map<string, { name: string; memberId: string }>
  >();

  /** socketId -> channelId, so disconnect/leave cleanup doesn't scan every channel. */
  private readonly socketChannel = new Map<string, string>();

  constructor(private readonly channels: ChannelsService) {}

  @SubscribeMessage(SOCKET_EVENTS.JOIN_CHANNEL)
  async handleJoinChannel(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { channelId, name } = JoinChannelPayloadSchema.parse(payload);

    try {
      await this.channels.findChannel(channelId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new WsException(err.message);
      }
      throw err;
    }

    // A socket belongs to one channel at a time; joining a new one implicitly
    // leaves whatever it was in before, so state never gets orphaned.
    const previousChannelId = this.socketChannel.get(client.id);
    if (previousChannelId && previousChannelId !== channelId) {
      this.removeFromChannel(client, previousChannelId);
    }

    await client.join(channelId);
    this.socketChannel.set(client.id, channelId);

    const { id: memberId } = await this.channels.openChannelMember(channelId, name);
    const members =
      this.channelMembers.get(channelId) ?? new Map<string, { name: string; memberId: string }>();
    members.set(client.id, { name, memberId });
    this.channelMembers.set(channelId, members);

    client.to(channelId).emit(SOCKET_EVENTS.USER_JOINED, { name, socketId: client.id });
    this.server.to(channelId).emit(SOCKET_EVENTS.MEMBER_LIST, {
      members: this.toMemberList(members),
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.CHAT_MESSAGE)
  async handleChatMessage(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { channelId, text } = ChatMessagePayloadSchema.parse(payload);

    // Authorship comes from the channel_members row opened at joinChannel,
    // not the payload's free-text `name` — a socket that hasn't joined this
    // channel has no member row to attribute the message to.
    const member = this.channelMembers.get(channelId)?.get(client.id);
    if (!member) {
      throw new WsException('Join the channel before sending messages');
    }

    // Insert first, then broadcast the stored row — every client sees the
    // same id/createdAt the database assigned (see chat.schema.ts).
    const message = await this.channels.addMessage(channelId, member.memberId, text);
    this.server.to(channelId).emit(SOCKET_EVENTS.CHAT_MESSAGE, message);
  }

  @SubscribeMessage(SOCKET_EVENTS.TYPING)
  handleTyping(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket): void {
    const { channelId, name, isTyping } = TypingPayloadSchema.parse(payload);
    client.to(channelId).emit(SOCKET_EVENTS.TYPING, { name, isTyping });
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_CHANNEL)
  async handleLeaveChannel(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { channelId } = LeaveChannelPayloadSchema.parse(payload);
    this.removeFromChannel(client, channelId);
    await client.leave(channelId);
    this.socketChannel.delete(client.id);
  }

  /** Same cleanup path as an explicit leaveChannel — a dropped connection is not a special case. */
  handleDisconnect(client: Socket): void {
    const channelId = this.socketChannel.get(client.id);
    if (!channelId) return;
    this.removeFromChannel(client, channelId);
    this.socketChannel.delete(client.id);
  }

  private removeFromChannel(client: Socket, channelId: string): void {
    const members = this.channelMembers.get(channelId);
    const member = members?.get(client.id);
    if (!members || member === undefined) return;

    members.delete(client.id);
    if (members.size === 0) {
      this.channelMembers.delete(channelId);
    }

    // Rows are never deleted (see ChannelMemberRow) — closing is best-effort
    // and shouldn't block or fail the socket-level leave/disconnect cleanup.
    this.channels
      .closeChannelMember(member.memberId)
      .catch((err: unknown) => console.error('Failed to close channel_members row', err));

    client.to(channelId).emit(SOCKET_EVENTS.USER_LEFT, { name: member.name, socketId: client.id });
    if (members.size > 0) {
      client.to(channelId).emit(SOCKET_EVENTS.MEMBER_LIST, {
        members: this.toMemberList(members),
      });
    }
  }

  private toMemberList(members: Map<string, { name: string; memberId: string }>): Member[] {
    return [...members].map(([socketId, member]) => ({ socketId, name: member.name }));
  }
}

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import {
  MAX_CALL_PARTICIPANTS,
  type CallParticipantRemovalRequest,
  type CallParticipantRemovalResponse,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';

import type { Database as GuestDatabase } from '../../database/guest-database.types';
import type { Database as PublicDatabase } from '../../database/database.types';
import { SupabaseService } from '../database/supabase.service';

type GuestMember = GuestDatabase['guest']['Tables']['channel_members']['Row'];
type GuestChannel = GuestDatabase['guest']['Tables']['channels']['Row'];
type ServerChannel = PublicDatabase['public']['Tables']['channels']['Row'];
type ServerChannelMember = PublicDatabase['public']['Tables']['channel_members']['Row'];
type ServerRole = PublicDatabase['public']['Tables']['server_members']['Row']['role'];

type AuthorizedCall = {
  identity: string;
  displayName: string;
  roomName: string;
  maxParticipants: number;
};

type AuthorizedServerAccess = {
  channel: ServerChannel;
  member: ServerChannelMember | null;
  serverRole: ServerRole;
  displayName: string;
};

@Injectable()
export class CallsService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;
  private readonly roomService: RoomServiceClient;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL');

    const httpUrl = this.livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
  }

  async createCallToken(
    userId: string,
    { channelId }: CallTokenRequest,
  ): Promise<CallTokenResponse> {
    const { member, channel } = await this.authorizeMembership(userId, channelId);
    return this.issueCallToken({
      identity: member.livekit_identity,
      displayName: member.display_name,
      roomName: channel.livekit_room_name,
      maxParticipants: channel.max_call_participants,
    });
  }

  async createServerCallToken(userId: string, channelId: string): Promise<CallTokenResponse> {
    return this.issueCallToken(await this.authorizeServerMembership(userId, channelId));
  }

  async getServerCallStatus(userId: string, channelId: string): Promise<CallStatusResponse> {
    const { channel } = await this.authorizeServerCallAccess(userId, channelId);
    const roomName = `server-channel:${channel.id}`;
    const participantCount = (await this.listParticipants(roomName)).length;
    return {
      active: participantCount > 0,
      participants: participantCount,
      maxParticipants: MAX_CALL_PARTICIPANTS,
    };
  }

  private async issueCallToken(call: AuthorizedCall): Promise<CallTokenResponse> {
    await this.ensureLiveKitRoom(call.roomName, call.maxParticipants);
    const participants = await this.listParticipants(call.roomName);

    if (
      participants.length >= call.maxParticipants &&
      !participants.some((participant) => participant.identity === call.identity)
    ) {
      throw new ConflictException(
        'The call just became full. You can stay in the room and join when a spot becomes available.',
      );
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: call.identity,
      name: call.displayName,
      ttl: '10m',
    });

    token.addGrant({
      room: call.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
    });

    return {
      token: await token.toJwt(),
      livekitUrl: this.livekitUrl,
      roomName: call.roomName,
    };
  }

  async getCallStatus(userId: string, channelId: string): Promise<CallStatusResponse> {
    const { channel } = await this.authorizeMembership(userId, channelId);
    const participantCount = (await this.listParticipants(channel.livekit_room_name)).length;
    return {
      active: participantCount > 0,
      participants: participantCount,
      maxParticipants: channel.max_call_participants,
    };
  }

  async removeModeratedParticipant(
    userId: string,
    { channelId, memberId }: CallParticipantRemovalRequest,
  ): Promise<CallParticipantRemovalResponse> {
    const guest = this.supabase.client.schema('guest');
    const channelResult = await guest.from('channels').select().eq('id', channelId).maybeSingle();

    if (channelResult.error) throw channelResult.error;
    if (!channelResult.data) throw new NotFoundException('Guest channel was not found');

    const channel = channelResult.data;
    if (channel.status !== 'active' || new Date(channel.expires_at).getTime() <= Date.now()) {
      throw new GoneException('Guest channel is no longer active');
    }
    if (!channel.owner_member_id) {
      throw new ForbiddenException('The channel does not have an active owner');
    }

    const [ownerResult, targetResult] = await Promise.all([
      guest
        .from('channel_members')
        .select()
        .eq('id', channel.owner_member_id)
        .eq('channel_id', channelId)
        .eq('user_id', userId)
        .is('left_at', null)
        .is('removed_at', null)
        .maybeSingle(),
      guest
        .from('channel_members')
        .select()
        .eq('id', memberId)
        .eq('channel_id', channelId)
        .maybeSingle(),
    ]);

    if (ownerResult.error || targetResult.error) {
      throw ownerResult.error ?? targetResult.error;
    }
    if (!ownerResult.data) {
      throw new ForbiddenException('Only the active channel owner can remove call participants');
    }
    if (!targetResult.data) {
      throw new NotFoundException('Channel member was not found');
    }
    if (
      targetResult.data.id === ownerResult.data.id ||
      !targetResult.data.removed_at ||
      targetResult.data.removed_by_member_id !== ownerResult.data.id
    ) {
      throw new ForbiddenException('The member has not been removed by the active channel owner');
    }

    try {
      await this.roomService.removeParticipant(
        channel.livekit_room_name,
        targetResult.data.livekit_identity,
        { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) },
      );
      return { removed: true };
    } catch (error: unknown) {
      if (isLiveKitRoomNotFound(error)) return { removed: false };
      throw new ServiceUnavailableException(
        'The member was removed, but the call could not be updated',
      );
    }
  }

  private async authorizeMembership(
    userId: string,
    channelId: string,
  ): Promise<{ member: GuestMember; channel: GuestChannel }> {
    const guest = this.supabase.client.schema('guest');
    const [memberResult, channelResult] = await Promise.all([
      guest
        .from('channel_members')
        .select()
        .eq('channel_id', channelId)
        .eq('user_id', userId)
        .is('left_at', null)
        .is('removed_at', null)
        .maybeSingle(),
      guest.from('channels').select().eq('id', channelId).maybeSingle(),
    ]);

    if (memberResult.error || channelResult.error) {
      throw memberResult.error ?? channelResult.error;
    }
    if (!channelResult.data) {
      throw new NotFoundException('Guest channel was not found');
    }
    if (!memberResult.data) {
      throw new ForbiddenException('Active guest channel membership required');
    }
    if (
      channelResult.data.status !== 'active' ||
      new Date(channelResult.data.expires_at).getTime() <= Date.now()
    ) {
      throw new GoneException('Guest channel is no longer active');
    }

    return { member: memberResult.data, channel: channelResult.data };
  }

  private async authorizeServerMembership(
    userId: string,
    channelId: string,
  ): Promise<AuthorizedCall> {
    const database = this.supabase.client;
    const access = await this.authorizeServerCallAccess(userId, channelId);
    const { channel } = access;
    let member = access.member;

    if (!member) {
      const insertResult = await database
        .from('channel_members')
        .insert({
          channel_id: channel.id,
          user_id: userId,
          role: access.serverRole,
        })
        .select()
        .maybeSingle();

      if (insertResult.error && insertResult.error.code !== '23505') {
        throw insertResult.error;
      }

      member = insertResult.data;
      if (!member) {
        const retryResult = await database
          .from('channel_members')
          .select()
          .eq('channel_id', channel.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (retryResult.error) throw retryResult.error;
        member = retryResult.data;
      }
    }

    if (!member || member.left_at || member.removed_at) {
      throw new ForbiddenException('Active channel membership is required to join this call');
    }

    return {
      identity: `server-member:${member.id}`,
      displayName: access.displayName,
      roomName: `server-channel:${channel.id}`,
      maxParticipants: MAX_CALL_PARTICIPANTS,
    };
  }

  private async authorizeServerCallAccess(
    userId: string,
    channelId: string,
  ): Promise<AuthorizedServerAccess> {
    const database = this.supabase.client;
    const channelResult = await database
      .from('channels')
      .select()
      .eq('id', channelId)
      .maybeSingle();

    if (channelResult.error) throw channelResult.error;
    if (!channelResult.data) throw new NotFoundException('Server channel was not found');

    const channel: ServerChannel = channelResult.data;
    const [serverMemberResult, channelMemberResult, userResult] = await Promise.all([
      database
        .from('server_members')
        .select()
        .eq('server_id', channel.server_id)
        .eq('user_id', userId)
        .maybeSingle(),
      database
        .from('channel_members')
        .select()
        .eq('channel_id', channel.id)
        .eq('user_id', userId)
        .maybeSingle(),
      database.from('users').select().eq('id', userId).maybeSingle(),
    ]);

    if (serverMemberResult.error || channelMemberResult.error || userResult.error) {
      throw serverMemberResult.error ?? channelMemberResult.error ?? userResult.error;
    }
    if (!serverMemberResult.data) {
      throw new ForbiddenException('Server membership is required to join this call');
    }
    if (!userResult.data) {
      throw new NotFoundException('Registered user profile was not found');
    }

    const member: ServerChannelMember | null = channelMemberResult.data;
    if (member && (member.left_at || member.removed_at)) {
      throw new ForbiddenException('Channel call access has been revoked');
    }

    return {
      channel,
      member,
      serverRole: serverMemberResult.data.role,
      displayName: userResult.data.name,
    };
  }

  private async listParticipants(roomName: string) {
    try {
      return await this.roomService.listParticipants(roomName);
    } catch (error: unknown) {
      if (isLiveKitRoomNotFound(error)) return [];

      // Do not silently report an active call as empty when LiveKit's server
      // API is temporarily unavailable. The same false zero could also bypass
      // the participant-limit check while issuing a new token.
      throw new ServiceUnavailableException('Could not read the live call state');
    }
  }

  private async ensureLiveKitRoom(roomName: string, maxParticipants: number): Promise<void> {
    try {
      await this.roomService.createRoom({
        name: roomName,
        maxParticipants,
      });
    } catch {
      throw new ServiceUnavailableException('Could not prepare the live call');
    }
  }
}

function isLiveKitRoomNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const record = error as Record<string, unknown>;
  const code = String(record['code'] ?? '').toLowerCase();
  const status = Number(record['status'] ?? record['statusCode'] ?? 0);
  const message = String(record['message'] ?? '').toLowerCase();

  return (
    status === 404 ||
    code === 'not_found' ||
    code === 'notfound' ||
    /room.+not found|could not find room|room does not exist/.test(message)
  );
}

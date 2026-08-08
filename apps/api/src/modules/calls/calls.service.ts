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
  type CallParticipantRemovalRequest,
  type CallParticipantRemovalResponse,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';

import type { Database } from '../../database/guest-database.types';
import { SupabaseService } from '../database/supabase.service';

type GuestMember = Database['guest']['Tables']['channel_members']['Row'];
type GuestChannel = Database['guest']['Tables']['channels']['Row'];

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
    await this.ensureLiveKitRoom(channel);
    const participants = await this.listParticipants(channel.livekit_room_name);

    if (
      participants.length >= channel.max_call_participants &&
      !participants.some((participant) => participant.identity === member.livekit_identity)
    ) {
      throw new ConflictException(
        'The call just became full. You can stay in the room and join when a spot becomes available.',
      );
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: member.livekit_identity,
      name: member.display_name,
      ttl: '10m',
    });

    token.addGrant({
      room: channel.livekit_room_name,
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
      roomName: channel.livekit_room_name,
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

  private async ensureLiveKitRoom(channel: GuestChannel): Promise<void> {
    try {
      await this.roomService.createRoom({
        name: channel.livekit_room_name,
        maxParticipants: channel.max_call_participants,
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

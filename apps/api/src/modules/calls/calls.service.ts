import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import {
  MAX_CALL_PARTICIPANTS,
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
    const participants = await this.listParticipants(channel.livekit_room_name);

    if (
      participants.length >= Math.min(channel.max_members, MAX_CALL_PARTICIPANTS) &&
      !participants.some((participant) => participant.identity === member.livekit_identity)
    ) {
      throw new ForbiddenException('The call has reached its participant limit');
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
    return { active: participantCount > 0, participants: participantCount };
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
    } catch {
      return [];
    }
  }
}

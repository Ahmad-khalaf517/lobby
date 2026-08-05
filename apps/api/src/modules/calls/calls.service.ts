import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import {
  MAX_CALL_PARTICIPANTS,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string; // wss:// URL the browser connects to
  private readonly roomService: RoomServiceClient;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL');

    // RoomServiceClient talks to LiveKit's HTTP API (needs https://, not wss://)
    const httpUrl = this.livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
  }

  async createCallToken(channelId: string, { name }: CallTokenRequest): Promise<CallTokenResponse> {
    const roomName = this.roomNameForChannel(channelId);

    // Soft cap: advisory only, logged for visibility — the token is still issued.
    const participantCount = await this.getParticipantCount(roomName);
    if (participantCount >= MAX_CALL_PARTICIPANTS) {
      this.logger.warn(
        `Room ${roomName} at/over soft cap (${participantCount}/${MAX_CALL_PARTICIPANTS}) — issuing token anyway`,
      );
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: this.makeIdentity(name),
      name,
      ttl: '10m', // short-lived: just long enough for the client to connect
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // audio-only per requirements — TrackSource enum, not a raw string
      canPublishSources: [TrackSource.MICROPHONE],
    });

    return {
      token: await token.toJwt(),
      livekitUrl: this.livekitUrl,
      roomName,
    };
  }

  /** Whether a LiveKit call is currently live for this channel (1+ participant). */
  async getCallStatus(channelId: string): Promise<CallStatusResponse> {
    const participantCount = await this.getParticipantCount(this.roomNameForChannel(channelId));
    return {
      active: participantCount > 0,
      participants: participantCount,
    };
  }

  private roomNameForChannel(channelId: string): string {
    return `channel-${channelId}`;
  }

  private makeIdentity(name: string): string {
    // LiveKit identities must be unique per-connection; suffix avoids collisions
    // when the same display name joins from two tabs/devices.
    return `${name}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async getParticipantCount(roomName: string): Promise<number> {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      return participants.length;
    } catch {
      // Room doesn't exist yet (nobody has joined) — treat as 0, not an error.
      return 0;
    }
  }
}

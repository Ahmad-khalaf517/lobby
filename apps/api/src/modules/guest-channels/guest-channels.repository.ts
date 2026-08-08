import { BadRequestException, Injectable } from '@nestjs/common';
import type { GuestChannelCreateRequest, GuestChannelCreateResponse } from '@lobby/shared';

import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class GuestChannelsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async create(
    accessToken: string,
    request: GuestChannelCreateRequest,
  ): Promise<GuestChannelCreateResponse> {
    const client = this.supabase.createUserClient(accessToken);
    const { data, error } = await client.schema('guest').rpc('create_channel', {
      p_name: request.name,
      p_max_call_participants: request.maxParticipants,
      p_lifetime_minutes: request.lifetimeMinutes,
    });

    if (error) throw new BadRequestException(error.message);

    const channel = data[0];
    if (!channel) throw new BadRequestException('The guest channel was not created');

    return { channelId: channel.channel_id, code: channel.code };
  }
}

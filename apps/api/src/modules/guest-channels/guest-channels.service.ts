import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { GuestChannelCreateRequest, GuestChannelCreateResponse } from '@lobby/shared';

import { GuestChannelsRepository } from './guest-channels.repository';

@Injectable()
export class GuestChannelsService {
  constructor(private readonly guestChannels: GuestChannelsRepository) {}

  create(
    user: User,
    accessToken: string,
    request: GuestChannelCreateRequest,
  ): Promise<GuestChannelCreateResponse> {
    if (user.is_anonymous !== false) {
      throw new ForbiddenException(
        'Advanced room configuration requires a registered Lobby account',
      );
    }

    return this.guestChannels.create(accessToken, request);
  }
}

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  GuestChannelCreateRequestSchema,
  type GuestChannelCreateRequest,
  type GuestChannelCreateResponse,
} from '@lobby/shared';

import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { GuestChannelsService } from './guest-channels.service';

@Controller('guest/channels')
@UseGuards(SupabaseAuthGuard)
export class GuestChannelsController {
  constructor(private readonly guestChannels: GuestChannelsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(GuestChannelCreateRequestSchema))
    body: GuestChannelCreateRequest,
  ): Promise<GuestChannelCreateResponse> {
    return this.guestChannels.create(request.user, request.accessToken, body);
  }
}

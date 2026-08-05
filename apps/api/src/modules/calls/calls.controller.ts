import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  CallTokenRequestSchema,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';

import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { CallsService } from './calls.service';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('livekit/token')
  createCallToken(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CallTokenRequestSchema)) body: CallTokenRequest,
  ): Promise<CallTokenResponse> {
    return this.callsService.createCallToken(request.user.id, body);
  }

  @Get('channels/:channelId/call-status')
  getCallStatus(
    @Req() request: AuthenticatedRequest,
    @Param('channelId') channelId: string,
  ): Promise<CallStatusResponse> {
    return this.callsService.getCallStatus(request.user.id, channelId);
  }
}

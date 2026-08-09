import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  CallParticipantRemovalRequestSchema,
  CallTokenRequestSchema,
  type CallParticipantRemovalRequest,
  type CallParticipantRemovalResponse,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';

import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/supabase-auth.guard';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
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

  @Post('server-channels/:channelId/call-token')
  @UseGuards(RegisteredUserGuard)
  createServerCallToken(
    @Req() request: AuthenticatedRequest,
    @Param('channelId', new ParseUUIDPipe()) channelId: string,
  ): Promise<CallTokenResponse> {
    return this.callsService.createServerCallToken(request.user.id, channelId);
  }

  @Get('server-channels/:channelId/call-status')
  @UseGuards(RegisteredUserGuard)
  getServerCallStatus(
    @Req() request: AuthenticatedRequest,
    @Param('channelId', new ParseUUIDPipe()) channelId: string,
  ): Promise<CallStatusResponse> {
    return this.callsService.getServerCallStatus(request.user.id, channelId);
  }

  @Post('dm-conversations/:conversationId/call-token')
  @UseGuards(RegisteredUserGuard)
  createDmCallToken(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<CallTokenResponse> {
    return this.callsService.createDmCallToken(request.user.id, conversationId);
  }

  @Get('dm-conversations/:conversationId/call-status')
  @UseGuards(RegisteredUserGuard)
  getDmCallStatus(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<CallStatusResponse> {
    return this.callsService.getDmCallStatus(request.user.id, conversationId);
  }

  @Post('livekit/remove-participant')
  removeParticipant(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CallParticipantRemovalRequestSchema))
    body: CallParticipantRemovalRequest,
  ): Promise<CallParticipantRemovalResponse> {
    return this.callsService.removeModeratedParticipant(request.user.id, body);
  }
}

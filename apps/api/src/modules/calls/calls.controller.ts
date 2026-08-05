import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  CallTokenRequestSchema,
  type CallStatusResponse,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { CallsService } from './calls.service.js';

@Controller('channels/:channelId')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('call-token')
  async createCallToken(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(CallTokenRequestSchema)) body: CallTokenRequest,
  ): Promise<CallTokenResponse> {
    return this.callsService.createCallToken(channelId, body);
  }

  @Get('call-status')
  async getCallStatus(@Param('channelId') channelId: string): Promise<CallStatusResponse> {
    return this.callsService.getCallStatus(channelId);
  }
}

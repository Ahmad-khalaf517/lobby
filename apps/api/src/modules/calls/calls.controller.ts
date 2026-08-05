import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  CallTokenRequestSchema,
  type CallTokenRequest,
  type CallTokenResponse,
} from '@lobby/shared';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { CallsService } from './calls.service.js';

@Controller('channels/:channelId/call-token')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  async createCallToken(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(CallTokenRequestSchema)) body: CallTokenRequest,
  ): Promise<CallTokenResponse> {
    return this.callsService.createCallToken(channelId, body);
  }
}

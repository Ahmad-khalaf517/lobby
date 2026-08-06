import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { CreateDmRequest, SendDmMessageRequest } from '@lobby/shared';
import { CreateDmRequestSchema, SendDmMessageRequestSchema } from '@lobby/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { DmsService } from './dms.service';

@UseGuards(SupabaseAuthGuard)
@Controller('dms')
export class DmsController {
  constructor(private readonly dmsService: DmsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.dmsService.listConversations(userId);
  }

  /** Idempotent — DMing someone who's already in your list reuses that conversation. */
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(CreateDmRequestSchema)) body: CreateDmRequest,
  ) {
    return this.dmsService.getOrCreateConversation(userId, body.userId);
  }

  @Get(':conversationId/messages')
  listMessages(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    return this.dmsService.listMessages(userId, conversationId, parsed);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(SendDmMessageRequestSchema)) body: SendDmMessageRequest,
  ) {
    return this.dmsService.sendMessage(userId, conversationId, body.body);
  }
}

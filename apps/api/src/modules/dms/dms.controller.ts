import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { CreateDmRequest } from '@lobby/shared';
import { CreateDmRequestSchema } from '@lobby/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { DmsService } from './dms.service';

@UseGuards(SupabaseAuthGuard, RegisteredUserGuard)
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
}

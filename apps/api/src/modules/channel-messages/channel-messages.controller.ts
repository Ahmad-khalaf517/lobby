import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  SendChannelMessageRequest,
  SetChannelMessageReactionRequest,
  UpdateChannelMessageRequest,
} from '@lobby/shared';
import {
  SendChannelMessageRequestSchema,
  SetChannelMessageReactionRequestSchema,
  UpdateChannelMessageRequestSchema,
} from '@lobby/shared';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { ChannelMessagesService } from './channel-messages.service';

/**
 * Channel messages are a registered-account feature, same as servers/channels —
 * RegisteredUserGuard runs after SupabaseAuthGuard so guest sessions can't reach
 * these routes.
 */
@Controller('servers/:serverId/channels/:channelId/messages')
@UseGuards(SupabaseAuthGuard, RegisteredUserGuard)
export class ChannelMessagesController {
  constructor(private readonly channelMessages: ChannelMessagesService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsed = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    const messages = await this.channelMessages.listMessages(
      serverId,
      channelId,
      request.user.id,
      parsed,
      before,
    );
    return { messages };
  }

  /** Full-text-ish search within a single channel. */
  @Get('search')
  search(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return this.channelMessages.searchMessages(serverId, channelId, request.user.id, q, parsed);
  }

  @Post()
  send(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(SendChannelMessageRequestSchema)) body: SendChannelMessageRequest,
  ) {
    return this.channelMessages.sendMessage(
      serverId,
      channelId,
      request.user.id,
      body.content,
      body.replyToMessageId ?? null,
    );
  }

  /** Only the sender can edit their own message. */
  @Patch(':messageId')
  edit(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(UpdateChannelMessageRequestSchema))
    body: UpdateChannelMessageRequest,
  ) {
    return this.channelMessages.editMessage(
      serverId,
      channelId,
      request.user.id,
      messageId,
      body.content,
    );
  }

  /** Only the sender can delete their own message (soft delete). */
  @Delete(':messageId')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    await this.channelMessages.deleteMessage(serverId, channelId, request.user.id, messageId);
  }

  /** Any channel member can add a reaction (idempotent). */
  @Put(':messageId/reaction')
  addReaction(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(SetChannelMessageReactionRequestSchema))
    body: SetChannelMessageReactionRequest,
  ) {
    return this.channelMessages.addReaction(
      serverId,
      channelId,
      request.user.id,
      messageId,
      body.emoji,
    );
  }

  /** Removes the caller's reaction for the given emoji (idempotent). */
  @Delete(':messageId/reaction')
  removeReaction(
    @Req() request: AuthenticatedRequest,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Query('emoji') emoji: string,
  ) {
    return this.channelMessages.removeReaction(
      serverId,
      channelId,
      request.user.id,
      messageId,
      emoji,
    );
  }
}

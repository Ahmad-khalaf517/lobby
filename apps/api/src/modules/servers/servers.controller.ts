import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateChannelRequestSchema,
  CreateServerRequestSchema,
  JoinServerRequestSchema,
  UpdateChannelRequestSchema,
  UpdateServerRequestSchema,
  type CreateChannelRequest,
  type CreateServerRequest,
  type JoinServerRequest,
  type UpdateChannelRequest,
  type UpdateServerRequest,
} from '@lobby/shared';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import { SameUserGuard } from '../../common/guards/same-user.guard';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { ServersService } from './servers.service';

/**
 * Servers and their channels are a registered-account feature. RegisteredUserGuard
 * runs after SupabaseAuthGuard so an anonymous (guest) session — which does carry a
 * valid Supabase token — can't reach any of these routes. Guest channels live
 * entirely in the `guest` schema and are driven from apps/web, not from here.
 */
@Controller('servers')
@UseGuards(SupabaseAuthGuard, RegisteredUserGuard)
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateServerRequestSchema)) body: CreateServerRequest,
  ) {
    return this.servers.createServer(request.user, body.name);
  }

  @Post('join')
  join(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(JoinServerRequestSchema)) body: JoinServerRequest,
  ) {
    return this.servers.joinServer(body.inviteCode, request.user);
  }

  @Get()
  async listForUser(@Req() request: AuthenticatedRequest) {
    const servers = await this.servers.listServersForUser(request.user.id);
    return { servers };
  }

  @Get(':id')
  find(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.servers.findServerWithChannels(id, request.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServerRequestSchema)) body: UpdateServerRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.servers.updateServer(id, request.user.id, body.name);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteServer(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.servers.deleteServer(id, request.user.id);
  }

  @Get(':id/members')
  async listMembers(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const members = await this.servers.listMembers(id, request.user.id);
    return { members };
  }

  @Post(':id/members/:memberUserId')
  addMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.servers.addMember(id, request.user.id, memberUserId);
  }

  @Delete(':id/members/:memberUserId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.servers.removeMember(id, request.user.id, memberUserId);
    return { success: true };
  }

  // :userId here must be the caller's own id — SameUserGuard enforces that.
  @UseGuards(SameUserGuard)
  @Post(':id/leave/:userId')
  async leave(@Param('id') id: string, @Param('userId') userId: string) {
    await this.servers.leaveServer(id, userId);
    return { success: true };
  }

  @Post(':id/leave')
  async leaveCurrentUser(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.servers.leaveServer(id, request.user.id);
    return { success: true };
  }

  @Post(':id/channels')
  createChannel(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateChannelRequestSchema)) body: CreateChannelRequest,
  ) {
    return this.servers.createChannel({
      created_by: request.user.id,
      name: body.name,
      server_id: id,
    });
  }

  @Patch(':id/channels/:channelId')
  updateChannel(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateChannelRequestSchema)) body: UpdateChannelRequest,
  ) {
    return this.servers.updateChannel(id, channelId, request.user.id, body.name);
  }

  @Delete(':id/channels/:channelId')
  @HttpCode(204)
  deleteChannel(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.servers.deleteChannel(id, channelId, request.user.id);
  }
}

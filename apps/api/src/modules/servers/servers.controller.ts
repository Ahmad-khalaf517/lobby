import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateServerRequestSchema, UpdateServerRequestSchema } from '@lobby/shared';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { ServersService } from './servers.service';
import { SameUserGuard } from '../../common/guards/same-user.guard';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@UseGuards(SupabaseAuthGuard)
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateServerRequestSchema)) body: { name: string },
    @CurrentUser() user: User,
  ) {
    return this.servers.createServer(user.id, body.name);
  }

  @Get()
  async listForUser(@CurrentUser() user: User) {
    const servers = await this.servers.listServersForUser(user.id);
    return { servers };
  }

  @Get(':id/members')
  async listMembers(@Param('id') id: string, @CurrentUser() user: User) {
    const members = await this.servers.listMembers(id, user.id);
    return { members };
  }

  @Get(':id')
  find(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servers.findServerWithChannels(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServerRequestSchema)) body: { name: string },
    @CurrentUser() user: User,
  ) {
    return this.servers.updateServer(id, user.id, body.name);
  }

  @Post(':id/members/:memberUserId')
  addMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: User,
  ) {
    return this.servers.addMember(id, user.id, memberUserId);
  }

  @Delete(':id/members/:memberUserId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: User,
  ) {
    await this.servers.removeMember(id, user.id, memberUserId);
    return { success: true };
  }

  // :userId here must be the caller's own id — SameUserGuard enforces that.
  @UseGuards(SameUserGuard)
  @Post(':id/leave/:userId')
  async leave(@Param('id') id: string, @Param('userId') userId: string) {
    await this.servers.leaveServer(id, userId);
    return { success: true };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateServerRequestSchema, UpdateServerRequestSchema } from '@lobby/shared';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { ServersService } from './servers.service';

@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateServerRequestSchema)) body: { name: string },
    @Query('userId') userId: string,
  ) {
    return this.servers.createServer(userId, body.name);
  }

  @Get()
  async listForUser(@Query('userId') userId: string) {
    const servers = await this.servers.listServersForUser(userId);
    return { servers };
  }

  @Get(':id')
  find(@Param('id') id: string, @Query('userId') userId: string) {
    return this.servers.findServerWithChannels(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServerRequestSchema)) body: { name: string },
    @Query('userId') userId: string,
  ) {
    return this.servers.updateServer(id, userId, body.name);
  }

  @Post(':id/members/:memberUserId')
  addMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Query('userId') userId: string,
  ) {
    return this.servers.addMember(id, userId, memberUserId);
  }

  @Delete(':id/members/:memberUserId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Query('userId') userId: string,
  ) {
    await this.servers.removeMember(id, userId, memberUserId);
    return { success: true };
  }
}

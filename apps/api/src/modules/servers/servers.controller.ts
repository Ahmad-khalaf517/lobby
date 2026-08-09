import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateServerRequestSchema, UpdateServerRequestSchema } from '@lobby/shared';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { ServersService } from './servers.service';

/**
 * userId is taken from a query param for now (`?userId=`), same pattern as
 * channels.controller.ts — no auth guard yet in this app.
 */
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
}

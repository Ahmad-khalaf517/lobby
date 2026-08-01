import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateChannelRequestSchema } from '@lobby/shared';
import { ChannelsService } from './channels.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(@Body() body: unknown) {
    const { name } = CreateChannelRequestSchema.parse(body);
    if (!name) {
      throw new BadRequestException('name is required');
    }

    return this.channels.createChannel(name);
  }

  @Get(':id')
  find(@Param('id') id: string) {
    return this.channels.findChannel(id);
  }

  @Get(':id/messages')
  async messages(@Param('id') id: string) {
    await this.channels.findChannel(id); // 404s if the channel doesn't exist/has expired
    const messages = await this.channels.getMessages(id);
    return { messages };
  }
}

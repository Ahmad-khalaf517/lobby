import { Injectable } from '@nestjs/common';
import type { Channel, Message } from '@lobby/shared';
import { ChannelsRepository } from './channels.repository';

@Injectable()
export class ChannelsService {
  constructor(private readonly channelsRepository: ChannelsRepository) {}

  createChannel(name: string): Promise<Channel> {
    return this.channelsRepository.createChannel(name);
  }

  findChannel(id: string): Promise<Channel> {
    return this.channelsRepository.findChannel(id);
  }

  getMessages(channelId: string): Promise<Message[]> {
    return this.channelsRepository.getMessages(channelId);
  }

  addMessage(channelId: string, authorName: string, text: string): Promise<Message> {
    return this.channelsRepository.addMessage(channelId, authorName, text);
  }

  deleteChannel(id: string): Promise<void> {
    return this.channelsRepository.deleteChannel(id);
  }
}

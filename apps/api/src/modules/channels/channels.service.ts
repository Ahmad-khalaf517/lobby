import { Injectable } from '@nestjs/common';
import type { Channel, Message } from '@lobby/shared';
import { ChannelsRepository } from './channels.repository';

@Injectable()
export class ChannelsService {
  constructor(private readonly channelsRepository: ChannelsRepository) {}

  listChannels(): Promise<Channel[]> {
    return this.channelsRepository.listChannels();
  }

  createChannel(name: string): Promise<Channel> {
    return this.channelsRepository.createChannel(name);
  }

  findChannel(id: string): Promise<Channel> {
    return this.channelsRepository.findChannel(id);
  }

  getMessages(channelId: string): Promise<Message[]> {
    return this.channelsRepository.getMessages(channelId);
  }

  openChannelMember(channelId: string, guestName: string): Promise<{ id: string }> {
    return this.channelsRepository.openChannelMember(channelId, guestName);
  }

  closeChannelMember(memberId: string): Promise<void> {
    return this.channelsRepository.closeChannelMember(memberId);
  }

  addMessage(channelId: string, senderId: string, text: string): Promise<Message> {
    return this.channelsRepository.addMessage(channelId, senderId, text);
  }

  deleteChannel(id: string): Promise<void> {
    return this.channelsRepository.deleteChannel(id);
  }
}

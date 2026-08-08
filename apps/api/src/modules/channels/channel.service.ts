import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Channel } from '@lobby/shared';
import { ChannelsRepository } from './channels.repository';
import { ChannelInsert } from '../../database/types';

@Injectable()
export class ChannelService {
  constructor(private readonly channelRepository: ChannelsRepository) {}

  /** Channel creation/rename/delete are owner-only — membership alone isn't enough. */
  async createChannel(channel: ChannelInsert): Promise<Channel> {
    return this.channelRepository.createChannelForServer(channel);
  }

  async updateChannel(serverId: string, channelId: string, name: string): Promise<Channel> {
    return this.channelRepository.updateChannel(serverId, channelId, name);
  }

  async deleteChannel(serverId: string, channelId: string): Promise<void> {
    // elsewhere can't be deleted through this server's owner check.
    await this.channelRepository.findChannelInServer(serverId, channelId);

    // A server with no channels has no landing spot — creation seeds a default
    // one for the same reason, so don't let deletion undo that.
    const remaining = await this.channelRepository.countChannelsForServer(serverId);
    if (remaining <= 1) {
      throw new ForbiddenException('A server needs at least one channel.');
    }

    await this.channelRepository.deleteChannel(serverId, channelId);
  }

  /** Channels that belong to a server (channels.server_id), oldest first. */
  async listChannelsForServer(serverId: string): Promise<Channel[]> {
    return this.channelRepository.listChannelsForServer(serverId);
  }

  /**
   * Looks a channel up *within* a server. Scoping by server_id (rather than
   * fetching by id alone) means a channel id from another server can never be
   * mutated through that server's owner check.
   */
  async findChannelInServer(serverId: string, channelId: string): Promise<Channel> {
    return this.channelRepository.findChannelInServer(serverId, channelId);
  }

  async countChannelsForServer(serverId: string): Promise<number> {
    return this.channelRepository.countChannelsForServer(serverId);
  }
}

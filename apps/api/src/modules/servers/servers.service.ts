import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { Channel, Server, ServerMember, ServerWithChannels } from '@lobby/shared';
import { ServersRepository } from './servers.repository';
import { ChannelService } from '../channels/channel.service';
import { ChannelInsert } from '../../database/types';

const DEFAULT_CHANNEL_NAME = 'general';

@Injectable()
export class ServersService {
  constructor(
    private readonly serversRepository: ServersRepository,
    private readonly channelService: ChannelService,
  ) {}

  async createServer(owner: User, name: string): Promise<Server> {
    const server = await this.serversRepository.createServer(owner, name);
    // A server with zero channels is a dead end — seed a default one to land in.
    await this.channelService.createChannel({
      name: DEFAULT_CHANNEL_NAME,
      server_id: server.id,
      created_by: owner.id,
    });
    return server;
  }

  listServersForUser(userId: string): Promise<Server[]> {
    return this.serversRepository.listServersForUser(userId);
  }

  /** GET /servers/:id — server details plus the channels that belong to it. */
  async findServerWithChannels(id: string, userId: string): Promise<ServerWithChannels> {
    await this.assertMember(id, userId);
    const [server, channels] = await Promise.all([
      this.serversRepository.findServer(id),
      this.channelService.listChannelsForServer(id),
    ]);
    return { ...server, channels };
  }

  async updateServer(id: string, userId: string, name: string): Promise<Server> {
    await this.assertOwner(id, userId);
    return this.serversRepository.updateServer(id, name);
  }

  async joinServer(inviteCode: string, user: User): Promise<Server> {
    const server = await this.serversRepository.findServerByInviteCode(inviteCode);
    const alreadyMember = await this.serversRepository.isMember(server.id, user.id);
    if (!alreadyMember) {
      await this.serversRepository.addMember(server.id, user, 'member');
    }
    return server;
  }

  async listMembers(serverId: string, userId: string): Promise<ServerMember[]> {
    await this.assertMember(serverId, userId);
    return this.serversRepository.listMembers(serverId);
  }

  async leaveServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serversRepository.findServer(serverId);
    if (server.ownerId === userId) {
      throw new ForbiddenException('Owner cannot leave their own server; delete it instead.');
    }
    await this.serversRepository.removeMember(serverId, userId);
  }

  /** Channel creation/rename/delete are owner-only — membership alone isn't enough. */
  async createChannel(channel: ChannelInsert): Promise<Channel> {
    await this.assertOwner(channel.server_id, channel.created_by);
    return this.channelService.createChannel(channel);
  }

  async updateChannel(
    serverId: string,
    channelId: string,
    userId: string,
    name: string,
  ): Promise<Channel> {
    await this.assertOwner(serverId, userId);
    return this.channelService.updateChannel(serverId, channelId, name);
  }

  async deleteChannel(serverId: string, channelId: string, userId: string): Promise<void> {
    await this.assertOwner(serverId, userId);
    // 404s when the channel belongs to a different server, so an id from
    // elsewhere can't be deleted through this server's owner check.
    await this.channelService.findChannelInServer(serverId, channelId);

    // A server with no channels has no landing spot — creation seeds a default
    // one for the same reason, so don't let deletion undo that.
    const remaining = await this.channelService.countChannelsForServer(serverId);
    if (remaining <= 1) {
      throw new ForbiddenException('A server needs at least one channel.');
    }

    await this.channelService.deleteChannel(serverId, channelId);
  }

  async listChannels(serverId: string, userId: string): Promise<Channel[]> {
    await this.assertMember(serverId, userId);
    return this.channelService.listChannelsForServer(serverId);
  }

  private async assertMember(serverId: string, userId: string): Promise<void> {
    const isMember = await this.serversRepository.isMember(serverId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this server.');
    }
  }

  private async assertOwner(serverId: string, userId: string): Promise<void> {
    const server = await this.serversRepository.findServer(serverId);
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can do this.');
    }
  }
}

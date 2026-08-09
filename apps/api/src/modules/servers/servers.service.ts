import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { Channel, Server, ServerMember, ServerWithChannels } from '@lobby/shared';
import { ServersRepository } from './servers.repository';
import { ChannelService } from '../channels/channel.service';
import { ServerMembersService } from '../server-members/server-members.service';
import { ChannelInsert } from '../../database/types';

const DEFAULT_CHANNEL_NAME = 'general';

@Injectable()
export class ServersService {
  constructor(
    private readonly serversRepository: ServersRepository,
    private readonly channelService: ChannelService,
    private readonly serverMembersService: ServerMembersService,
  ) {}

  async createServer(owner: User, name: string): Promise<Server> {
    const server = await this.serversRepository.createServer(owner, name);
    await this.serverMembersService.addMember(server.id, owner.id, 'owner');
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
    const alreadyMember = await this.serverMembersService.isMember(server.id, user.id);
    if (!alreadyMember) {
      await this.serversRepository.ensureUserExists(user);
      await this.serverMembersService.addMember(server.id, user.id, 'member');
    }
    return server;
  }

  async listMembers(serverId: string, userId: string): Promise<ServerMember[]> {
    await this.assertMember(serverId, userId);
    return this.serverMembersService.listMembers(serverId);
  }

  /** Only the owner can add a member directly. */
  async addMember(
    serverId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<ServerMember> {
    await this.assertOwner(serverId, requesterId);
    return this.serverMembersService.addMember(serverId, targetUserId, 'member');
  }

  /** Only the owner can remove members; the owner can't remove themself this way. */
  async removeMember(serverId: string, requesterId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(serverId, requesterId);
    if (targetUserId === requesterId) {
      throw new ForbiddenException('Owner cannot remove themself; delete the server instead.');
    }
    await this.serverMembersService.removeMember(serverId, targetUserId);
  }

  async leaveServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serversRepository.findServer(serverId);
    if (server.ownerId === userId) {
      throw new ForbiddenException('Owner cannot leave their own server; delete it instead.');
    }
    await this.serverMembersService.removeMember(serverId, userId);
  }

  async deleteServer(serverId: string, userId: string): Promise<void> {
    await this.assertOwner(serverId, userId);
    await this.serversRepository.deleteServer(serverId);
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
    // ChannelService already enforces "channel belongs to this server" and
    // "a server needs at least one channel" — trust it instead of re-checking here.
    await this.channelService.deleteChannel(serverId, channelId);
  }

  async listChannels(serverId: string, userId: string): Promise<Channel[]> {
    await this.assertMember(serverId, userId);
    return this.channelService.listChannelsForServer(serverId);
  }

  private async assertMember(serverId: string, userId: string): Promise<void> {
    const isMember = await this.serverMembersService.isMember(serverId, userId);
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

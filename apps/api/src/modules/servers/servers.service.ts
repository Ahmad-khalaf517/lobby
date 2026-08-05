import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Channel, Server, ServerMember, ServerWithChannels } from '@lobby/shared';
import { ServersRepository } from './servers.repository';

@Injectable()
export class ServersService {
  constructor(private readonly serversRepository: ServersRepository) {}

  createServer(ownerId: string, name: string): Promise<Server> {
    return this.serversRepository.createServer(ownerId, name);
  }

  listServersForUser(userId: string): Promise<Server[]> {
    return this.serversRepository.listServersForUser(userId);
  }

  /** GET /servers/:id — server details plus the channels that belong to it. */
  async findServerWithChannels(id: string, userId: string): Promise<ServerWithChannels> {
    await this.assertMember(id, userId);
    const [server, channels] = await Promise.all([
      this.serversRepository.findServer(id),
      this.serversRepository.listChannelsForServer(id),
    ]);
    return { ...server, channels };
  }

  async updateServer(id: string, userId: string, name: string): Promise<Server> {
    await this.assertOwner(id, userId);
    return this.serversRepository.updateServer(id, name);
  }

  async joinServer(inviteCode: string, userId: string): Promise<Server> {
    const server = await this.serversRepository.findServerByInviteCode(inviteCode);
    const alreadyMember = await this.serversRepository.isMember(server.id, userId);
    if (!alreadyMember) {
      await this.serversRepository.addMember(server.id, userId, 'member');
    }
    return server;
  }

  listMembers(serverId: string): Promise<ServerMember[]> {
    return this.serversRepository.listMembers(serverId);
  }

  /** Only the owner can add a member directly. */
  async addMember(
    serverId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<ServerMember> {
    await this.assertOwner(serverId, requesterId);
    return this.serversRepository.addMember(serverId, targetUserId, 'member');
  }

  /** Only the owner can remove members; the owner can't remove themself this way. */
  async removeMember(serverId: string, requesterId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(serverId, requesterId);
    if (targetUserId === requesterId) {
      throw new ForbiddenException('Owner cannot remove themself; delete the server instead.');
    }
    await this.serversRepository.removeMember(serverId, targetUserId);
  }

  async leaveServer(serverId: string, userId: string): Promise<void> {
    const server = await this.serversRepository.findServer(serverId);
    if (server.ownerId === userId) {
      throw new ForbiddenException('Owner cannot leave their own server; delete it instead.');
    }
    await this.serversRepository.removeMember(serverId, userId);
  }

  async createChannel(serverId: string, userId: string, name: string): Promise<Channel> {
    await this.assertMember(serverId, userId);
    return this.serversRepository.createChannelForServer(serverId, name);
  }

  async listChannels(serverId: string, userId: string): Promise<Channel[]> {
    await this.assertMember(serverId, userId);
    return this.serversRepository.listChannelsForServer(serverId);
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

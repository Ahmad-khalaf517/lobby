import { Injectable } from '@nestjs/common';
import type { ServerMember } from '@lobby/shared';
import { ServerMembersRepository } from './server-members.repository';
import { ServerMemberInsert } from '../../database/types';

@Injectable()
export class ServerMembersService {
  constructor(private readonly serverMembersRepository: ServerMembersRepository) {}

  /** Caller owns authorization (owner-only, self-join, etc.) and user scaffolding. */
  addMember(
    serverId: string,
    userId: string,
    role: ServerMemberInsert['role'] = 'member',
  ): Promise<ServerMember> {
    return this.serverMembersRepository.addMember(serverId, userId, role);
  }

  isMember(serverId: string, userId: string): Promise<boolean> {
    return this.serverMembersRepository.isMember(serverId, userId);
  }

  listMembers(serverId: string): Promise<ServerMember[]> {
    return this.serverMembersRepository.listMembers(serverId);
  }

  removeMember(serverId: string, userId: string): Promise<void> {
    return this.serverMembersRepository.removeMember(serverId, userId);
  }
}

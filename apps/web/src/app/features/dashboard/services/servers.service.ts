import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ChannelSchema,
  CreateChannelRequestSchema,
  CreateServerRequestSchema,
  JoinServerRequestSchema,
  ServerListResponseSchema,
  ServerMemberListResponseSchema,
  ServerMemberSchema,
  ServerSchema,
  ServerWithChannelsSchema,
  UpdateChannelRequestSchema,
  UpdateServerRequestSchema,
  type Channel,
  type Server,
  type ServerMember,
  type ServerWithChannels,
} from '@lobby/shared';

import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ServersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  async listServers(): Promise<Server[]> {
    const raw = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/servers`));
    return ServerListResponseSchema.parse(raw).servers;
  }

  async getServer(id: string): Promise<ServerWithChannels> {
    const raw = await firstValueFrom(this.http.get<unknown>(`${this.apiUrl}/servers/${id}`));
    return ServerWithChannelsSchema.parse(raw);
  }

  async createServer(name: string): Promise<Server> {
    const body = CreateServerRequestSchema.parse({ name });
    const raw = await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/servers`, body));
    return ServerSchema.parse(raw);
  }

  /** Owner-only server-side; the UI hides the affordance for non-owners. */
  async updateServer(id: string, name: string): Promise<Server> {
    const body = UpdateServerRequestSchema.parse({ name });
    const raw = await firstValueFrom(
      this.http.patch<unknown>(`${this.apiUrl}/servers/${id}`, body),
    );
    return ServerSchema.parse(raw);
  }

  async joinServer(inviteCode: string): Promise<Server> {
    const body = JoinServerRequestSchema.parse({ inviteCode });
    const raw = await firstValueFrom(this.http.post<unknown>(`${this.apiUrl}/servers/join`, body));
    return ServerSchema.parse(raw);
  }

  async listMembers(serverId: string): Promise<ServerMember[]> {
    const raw = await firstValueFrom(
      this.http.get<unknown>(`${this.apiUrl}/servers/${serverId}/members`),
    );
    return ServerMemberListResponseSchema.parse(raw).members;
  }

  /** Owner-only server-side; the UI hides the affordance for non-owners. */
  async addMember(serverId: string, memberUserId: string): Promise<ServerMember> {
    const raw = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/servers/${serverId}/members/${memberUserId}`, {}),
    );
    return ServerMemberSchema.parse(raw);
  }

  /** Owner-only server-side; the UI hides the affordance for non-owners. */
  async removeMember(serverId: string, memberUserId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/servers/${serverId}/members/${memberUserId}`),
    );
  }

  async createChannel(serverId: string, name: string): Promise<Channel> {
    const body = CreateChannelRequestSchema.parse({ name });
    const raw = await firstValueFrom(
      this.http.post<unknown>(`${this.apiUrl}/servers/${serverId}/channels`, body),
    );
    return ChannelSchema.parse(raw);
  }

  /** Owner-only server-side; the UI hides the affordance for non-owners. */
  async updateChannel(serverId: string, channelId: string, name: string): Promise<Channel> {
    const body = UpdateChannelRequestSchema.parse({ name });
    const raw = await firstValueFrom(
      this.http.patch<unknown>(`${this.apiUrl}/servers/${serverId}/channels/${channelId}`, body),
    );
    return ChannelSchema.parse(raw);
  }

  async deleteChannel(serverId: string, channelId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<unknown>(`${this.apiUrl}/servers/${serverId}/channels/${channelId}`),
    );
  }
}

import { inject, Injectable, signal } from '@angular/core';
import type { Channel, Server, ServerMember } from '@lobby/shared';

import { ProfileService } from '../../profile/services/profile.service';
import { ServersService } from './servers.service';

/** Human-friendly context for whichever channel the user is currently voice-connected to, shown by the rail's persistent call widget. */
export type ActiveCallContext = {
  serverId: string;
  channelId: string;
  channelName: string;
  serverName: string;
};

/** A server_members row decorated with the profile fields the roster UI needs. */
export type ServerMemberWithProfile = ServerMember & {
  name: string;
  avatarUrl: string | null;
};

/**
 * Rail-level dashboard state: the server list plus the create/join-server
 * modal visibility. Kept separate from per-server data (channels, members),
 * which server-shell/channel-view fetch directly — this store only owns what
 * the rail and header need regardless of which server is active.
 *
 * `channelsByServer` is a lazy cache: whoever fetches a server's full detail
 * (server-shell, channel-view) reports its channels back here via
 * `cacheChannels`, so the rail can link straight to a channel instead of the
 * bare server route once a server has been visited at least once.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly serversService = inject(ServersService);
  private readonly profileService = inject(ProfileService);

  private readonly _servers = signal<Server[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _createModalOpen = signal(false);
  private readonly _joinModalOpen = signal(false);
  private readonly _channelsByServer = signal<Record<string, Channel[]>>({});
  private readonly _activeCall = signal<ActiveCallContext | null>(null);
  private readonly _membersByServer = signal<Record<string, ServerMemberWithProfile[]>>({});
  private readonly membersLoading = new Set<string>();

  readonly servers = this._servers.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly createModalOpen = this._createModalOpen.asReadonly();
  readonly joinModalOpen = this._joinModalOpen.asReadonly();
  readonly channelsByServer = this._channelsByServer.asReadonly();
  readonly membersByServer = this._membersByServer.asReadonly();

  private loaded = false;

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.load();
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._servers.set(await this.serversService.listServers());
      this.loaded = true;
    } catch {
      this._error.set('Could not load your servers.');
    } finally {
      this._loading.set(false);
    }
  }

  openCreateModal(): void {
    this._joinModalOpen.set(false);
    this._createModalOpen.set(true);
  }

  openJoinModal(): void {
    this._createModalOpen.set(false);
    this._joinModalOpen.set(true);
  }

  closeModals(): void {
    this._createModalOpen.set(false);
    this._joinModalOpen.set(false);
  }

  async createServer(name: string): Promise<Server> {
    const server = await this.serversService.createServer(name);
    this._servers.update((servers) => [...servers, server]);
    this._createModalOpen.set(false);
    return server;
  }

  async joinServer(inviteCode: string): Promise<Server> {
    const server = await this.serversService.joinServer(inviteCode);
    this._servers.update((servers) =>
      servers.some((existing) => existing.id === server.id) ? servers : [...servers, server],
    );
    this._joinModalOpen.set(false);
    return server;
  }

  async renameServer(serverId: string, name: string): Promise<Server> {
    const server = await this.serversService.updateServer(serverId, name);
    this._servers.update((servers) =>
      servers.map((candidate) => (candidate.id === serverId ? server : candidate)),
    );
    return server;
  }

  cacheChannels(serverId: string, channels: Channel[]): void {
    this._channelsByServer.update((current) => ({ ...current, [serverId]: channels }));
  }

  firstChannelId(serverId: string): string | null {
    return this._channelsByServer()[serverId]?.[0]?.id ?? null;
  }

  membersFor(serverId: string): ServerMemberWithProfile[] {
    return this._membersByServer()[serverId] ?? [];
  }

  /** Lazy per-server roster cache, mirroring `cacheChannels`/`channelsByServer` above. */
  async loadMembers(serverId: string, force = false): Promise<void> {
    if (!force && (this._membersByServer()[serverId] || this.membersLoading.has(serverId))) {
      return;
    }

    this.membersLoading.add(serverId);
    try {
      const members = await this.serversService.listMembers(serverId);
      const userIds = [...new Set(members.map((member) => member.userId))];

      // Resolved via the API's per-user profile endpoint (service-role, no RLS)
      // rather than a direct Supabase read — a member's row on `public.users`
      // isn't necessarily readable to every other member under RLS, which
      // silently produced empty results (member showed as "Member", no avatar).
      const profiles = new Map<string, { name: string; avatarUrl: string | null }>();
      const results = await Promise.allSettled(
        userIds.map((id) => this.profileService.getProfile(id)),
      );
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          profiles.set(userIds[index], {
            name: result.value.displayName,
            avatarUrl: result.value.avatarUrl,
          });
        }
      });

      const withProfiles: ServerMemberWithProfile[] = members.map((member) => ({
        ...member,
        name: profiles.get(member.userId)?.name ?? 'Member',
        avatarUrl: profiles.get(member.userId)?.avatarUrl ?? null,
      }));

      this._membersByServer.update((current) => ({ ...current, [serverId]: withProfiles }));
    } finally {
      this.membersLoading.delete(serverId);
    }
  }

  /** Owner-only; the UI hides the affordance for non-owners. Refreshes the roster on success. */
  async addMember(serverId: string, memberUserId: string): Promise<void> {
    await this.serversService.addMember(serverId, memberUserId);
    await this.loadMembers(serverId, true);
  }

  /** Owner-only; the UI hides the affordance for non-owners. Refreshes the roster on success. */
  async removeMember(serverId: string, memberUserId: string): Promise<void> {
    await this.serversService.removeMember(serverId, memberUserId);
    await this.loadMembers(serverId, true);
  }
}

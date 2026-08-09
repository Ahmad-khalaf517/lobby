import { effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Channel, Server, ServerMember } from '@lobby/shared';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { SessionScopeService, type SessionScope } from '../../../core/session-scope.service';
import { SupabaseSessionService } from '../../../core/supabase/supabase-session.service';
import { ProfileService } from '../../profile/services/profile.service';
import { LiveKitCallService } from '../../../shared/components/call-room/services/livekit-call.service';
import { ServersService } from './servers.service';

/** Human-friendly context for whichever channel the user is currently voice-connected to, shown by the rail's persistent call widget. */
export type ActiveCallContext = {
  serverId: string;
  channelId: string;
  channelName: string;
  serverName: string;
};

const AUTHENTICATED_CALL_SESSION_KEY_PREFIX = 'lobby:authenticated-call:';

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
  private readonly sessionScope = inject(SessionScopeService);
  private readonly supabase = inject(SupabaseSessionService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly call = inject(LiveKitCallService);

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
  readonly activeCall = this._activeCall.asReadonly();
  readonly membersByServer = this._membersByServer.asReadonly();

  private loaded = false;
  private activeCallStorageKey: string | null = null;
  private membershipChannel: RealtimeChannel | null = null;

  constructor() {
    this.sessionScope.registerCleanup(() => this.reset());
    effect(() => {
      const userId = this.sessionScope.userId();
      if (userId) this.subscribeMembership(userId);
      else void this.unsubscribeMembership();
    });
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.load();
  }

  async load(): Promise<void> {
    const scope = this.requireScope();
    this._loading.set(true);
    this._error.set(null);
    try {
      const servers = await this.serversService.listServers();
      this.assertCurrent(scope);
      this._servers.set(servers);
      this.loaded = true;
    } catch {
      if (this.sessionScope.isCurrent(scope)) {
        this._error.set('Could not load your servers.');
      }
    } finally {
      if (this.sessionScope.isCurrent(scope)) this._loading.set(false);
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
    const scope = this.requireScope();
    const server = await this.serversService.createServer(name);
    this.assertCurrent(scope);
    this._servers.update((servers) => [...servers, server]);
    this._createModalOpen.set(false);
    return server;
  }

  async joinServer(inviteCode: string): Promise<Server> {
    const scope = this.requireScope();
    const server = await this.serversService.joinServer(inviteCode);
    this.assertCurrent(scope);
    this._servers.update((servers) =>
      servers.some((existing) => existing.id === server.id) ? servers : [...servers, server],
    );
    this._joinModalOpen.set(false);
    return server;
  }

  async renameServer(serverId: string, name: string): Promise<Server> {
    const scope = this.requireScope();
    const server = await this.serversService.updateServer(serverId, name);
    this.assertCurrent(scope);
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

  setActiveCall(context: ActiveCallContext): void {
    this._activeCall.set(context);
    const key = this.callStorageKey();
    this.activeCallStorageKey = key;
    if (!key || typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(key, JSON.stringify(context));
    } catch {
      // Call restoration is optional; the connected LiveKit room remains active.
    }
  }

  restoreActiveCall(): ActiveCallContext | null {
    const current = this._activeCall();
    if (current) return current;

    const key = this.callStorageKey();
    this.activeCallStorageKey = key;
    if (!key || typeof window === 'undefined') return null;

    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ActiveCallContext>;
      if (
        typeof parsed.serverId !== 'string' ||
        typeof parsed.channelId !== 'string' ||
        typeof parsed.channelName !== 'string' ||
        typeof parsed.serverName !== 'string'
      ) {
        window.sessionStorage.removeItem(key);
        return null;
      }

      const context: ActiveCallContext = {
        serverId: parsed.serverId,
        channelId: parsed.channelId,
        channelName: parsed.channelName,
        serverName: parsed.serverName,
      };
      this._activeCall.set(context);
      return context;
    } catch {
      return null;
    }
  }

  clearActiveCall(): void {
    this._activeCall.set(null);
    const key = this.activeCallStorageKey ?? this.callStorageKey();
    this.activeCallStorageKey = null;
    if (!key || typeof window === 'undefined') return;

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage restrictions must not prevent an explicit LiveKit disconnect.
    }
  }

  membersFor(serverId: string): ServerMemberWithProfile[] {
    return this._membersByServer()[serverId] ?? [];
  }

  /** Lazy per-server roster cache, mirroring `cacheChannels`/`channelsByServer` above. */
  async loadMembers(serverId: string, force = false): Promise<void> {
    if (!force && (this._membersByServer()[serverId] || this.membersLoading.has(serverId))) {
      return;
    }

    const scope = this.requireScope();
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

      this.assertCurrent(scope);
      this._membersByServer.update((current) => ({ ...current, [serverId]: withProfiles }));
    } finally {
      this.membersLoading.delete(serverId);
    }
  }

  /** Owner-only; the UI hides the affordance for non-owners. Refreshes the roster on success. */
  async addMember(serverId: string, memberUserId: string): Promise<void> {
    const scope = this.requireScope();
    await this.serversService.addMember(serverId, memberUserId);
    this.assertCurrent(scope);
    await this.loadMembers(serverId, true);
  }

  /** Owner-only; the UI hides the affordance for non-owners. Refreshes the roster on success. */
  async removeMember(serverId: string, memberUserId: string): Promise<void> {
    const scope = this.requireScope();
    await this.serversService.removeMember(serverId, memberUserId);
    this.assertCurrent(scope);
    await this.loadMembers(serverId, true);
  }

  async leaveServer(serverId: string): Promise<void> {
    const scope = this.requireScope();
    await this.serversService.leaveServer(serverId);
    this.assertCurrent(scope);
    this.removeServerState(serverId);
  }

  async deleteServer(serverId: string): Promise<void> {
    const scope = this.requireScope();
    await this.serversService.deleteServer(serverId);
    this.assertCurrent(scope);
    this.removeServerState(serverId);
  }

  private removeServerState(serverId: string): void {
    this._servers.update((servers) => servers.filter((server) => server.id !== serverId));
    this._channelsByServer.update((current) => {
      const next = { ...current };
      delete next[serverId];
      return next;
    });
    this._membersByServer.update((current) => {
      const next = { ...current };
      delete next[serverId];
      return next;
    });
    if (this._activeCall()?.serverId === serverId) this.clearActiveCall();
  }

  reset(): void {
    void this.unsubscribeMembership();
    this.clearActiveCall();
    this.loaded = false;
    this.membersLoading.clear();
    this._servers.set([]);
    this._loading.set(false);
    this._error.set(null);
    this._createModalOpen.set(false);
    this._joinModalOpen.set(false);
    this._channelsByServer.set({});
    this._membersByServer.set({});
  }

  private subscribeMembership(userId: string): void {
    if (this.membershipChannel) return;
    this.membershipChannel = this.supabase.client
      .channel(`server-membership:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'server_members',
        },
        () => this.ngZone.run(() => void this.refreshMembershipAfterDelete(userId)),
      )
      .subscribe();
  }

  private async refreshMembershipAfterDelete(userId: string): Promise<void> {
    const scope = this.sessionScope.capture();
    if (scope.userId !== userId) return;
    try {
      const servers = await this.serversService.listServers();
      this.assertCurrent(scope);
      const remainingIds = new Set(servers.map((server) => server.id));
      const removedIds = this._servers()
        .map((server) => server.id)
        .filter((serverId) => !remainingIds.has(serverId));
      this._servers.set(servers);
      for (const serverId of removedIds) {
        if (this._activeCall()?.serverId === serverId) await this.call.disconnect();
        this.removeServerState(serverId);
        if (this.router.url.includes(`/app/servers/${serverId}`)) {
          await this.router.navigate(['/app']);
        }
      }
    } catch {
      // A transient refresh failure is harmless; the next dashboard request is
      // still protected by server membership authorization.
    }
  }

  private async unsubscribeMembership(): Promise<void> {
    const channel = this.membershipChannel;
    this.membershipChannel = null;
    if (channel) await this.supabase.client.removeChannel(channel).catch(() => undefined);
  }

  private callStorageKey(): string | null {
    const userId = this.sessionScope.userId();
    return userId ? `${AUTHENTICATED_CALL_SESSION_KEY_PREFIX}${userId}` : null;
  }

  private requireScope(): SessionScope {
    const scope = this.sessionScope.capture();
    if (!scope.userId) throw new Error('An authenticated account is required.');
    return scope;
  }

  private assertCurrent(scope: SessionScope): void {
    if (!this.sessionScope.isCurrent(scope)) {
      throw new Error('The authenticated account changed before the request completed.');
    }
  }
}

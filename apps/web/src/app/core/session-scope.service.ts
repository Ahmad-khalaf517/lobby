import { Injectable, signal } from '@angular/core';

export type SessionScope = {
  revision: number;
  userId: string | null;
};

export type SessionCleanup = () => void | Promise<void>;

/**
 * Coordinates state that belongs to one Supabase account.
 *
 * Access-token refreshes for the same user leave the scope untouched. Logout
 * and account changes advance the revision first, then run every registered
 * cleanup. Async feature work can capture a scope and refuse to commit after
 * that revision becomes stale.
 */
@Injectable({ providedIn: 'root' })
export class SessionScopeService {
  private readonly currentUserId = signal<string | null>(null);
  private readonly currentRevision = signal(0);
  private readonly cleanups = new Set<SessionCleanup>();

  readonly userId = this.currentUserId.asReadonly();
  readonly revision = this.currentRevision.asReadonly();

  capture(): SessionScope {
    return { revision: this.currentRevision(), userId: this.currentUserId() };
  }

  isCurrent(scope: SessionScope): boolean {
    return scope.revision === this.currentRevision() && scope.userId === this.currentUserId();
  }

  registerCleanup(cleanup: SessionCleanup): () => void {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }

  async transitionTo(userId: string | null): Promise<void> {
    if (this.currentUserId() === userId) return;

    // Invalidate pending work before any asynchronous cleanup starts.
    this.currentRevision.update((revision) => revision + 1);
    this.currentUserId.set(userId);

    await Promise.allSettled([...this.cleanups].map((cleanup) => Promise.resolve(cleanup())));
  }
}

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProfilePopupService {
  private readonly openUserId = signal<string | null>(null);

  /** The userId currently shown in the popup, or null if it's closed. */
  readonly userId = this.openUserId.asReadonly();

  /** Open the popup for a given user. Callers pass the current user's id for "my profile". */
  open(userId: string): void {
    this.openUserId.set(userId);
  }

  close(): void {
    this.openUserId.set(null);
  }
}

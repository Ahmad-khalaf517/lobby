import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

type FriendsTab = 'all' | 'pending' | 'blocked';

/**
 * Full-page friends view — static/empty state only. Friend requests and
 * blocking (schema.friendships) have no backend wired up yet; this gives the
 * rail's friends icon a real page to open, ready to be fed real data later.
 * Routed (not a rail popover) so it fills the outlet like channel-view does.
 */
@Component({
  selector: 'app-friends-page',
  standalone: true,
  templateUrl: './friends-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class FriendsPage {
  protected readonly tab = signal<FriendsTab>('all');

  protected selectTab(tab: FriendsTab): void {
    this.tab.set(tab);
  }
}

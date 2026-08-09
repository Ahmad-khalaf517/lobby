import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { UserProfile } from '@lobby/shared';
import { FriendsService } from '../../../features/friends/friends.service';
import { ProfileService } from '../../../features/profile/services/profile.service';
import { PersonAvatarComponent } from '../person-avatar/person-avatar.component';
import type { Person } from '../person-avatar/person.model';
import type { ChatAvatarShape, ChatAvatarSize } from '../room-chat';

type PopoverStatus = 'loading' | 'friend' | 'stranger' | 'error';
type PopoverPlacement = 'below' | 'above';

/**
 * An avatar that shows a mini user-profile popover on hover.
 *
 * Friends get the profile without any action; non-friends get an "Add friend"
 * button (which sends the request and shows a "sent" state). Safe to place
 * anywhere — it only adds a hovered popover around the avatar.
 *
 * The popover is `position: fixed` and placed against the avatar's bounding
 * rect at mouseenter, so it never gets clipped by a scrollable/overflow
 * ancestor and stays within the viewport.
 */
@Component({
  selector: 'app-user-popover-avatar',
  standalone: true,
  imports: [PersonAvatarComponent],
  templateUrl: './user-popover-avatar.component.html',
  styles: [
    `
      @keyframes popover-in {
        from {
          opacity: 0;
          transform: translateY(4px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .animate-popover-in {
        animation: popover-in 0.12s ease-out;
      }
      .popover-origin-top {
        transform-origin: top center;
      }
      .popover-origin-bottom {
        transform-origin: bottom center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-grid',
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
    '(click)': 'onHostClick($event)',
  },
})
export class UserPopoverAvatarComponent {
  person = input.required<Person>();
  size = input<ChatAvatarSize>('md');
  shape = input<ChatAvatarShape>('circle');

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly profileService = inject(ProfileService);
  private readonly friendsService = inject(FriendsService);
  private readonly popoverEl = viewChild.required<ElementRef<HTMLElement>>('popover');

  protected readonly open = signal(false);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly status = signal<PopoverStatus>('loading');
  protected readonly requestSent = signal(false);

  protected readonly placement = signal<PopoverPlacement>('below');
  protected readonly left = signal(0);
  protected readonly top = signal(0);
  protected readonly caretLeft = signal(0);

  protected readonly loadingProfile = computed(() => this.status() === 'loading');

  private readonly POPOVER_WIDTH = 240;
  private readonly POPOVER_EST_HEIGHT = 230;
  private readonly GAP = 12;
  private readonly MARGIN = 10;

  private loadedFor = '';
  private scrollCleanup: (() => void) | null = null;

  protected onMouseEnter(): void {
    this.open.set(true);
    this.positionPopover();
    this.subscribeScrollClose();
    void this.ensureLoaded();
  }

  protected onMouseLeave(): void {
    this.open.set(false);
    this.scrollCleanup?.();
    this.scrollCleanup = null;
  }

  /** Stop clicks on the popover (e.g. the Add friend button) from bubbling to a parent row. */
  protected onHostClick(event: Event): void {
    event.stopPropagation();
  }

  /** Anchor the fixed popover near the avatar, flipped above when it would overflow the viewport. */
  private positionPopover(): void {
    const rect = this.hostRef.nativeElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { POPOVER_WIDTH, GAP, MARGIN, POPOVER_EST_HEIGHT } = this;

    let left = rect.left;
    if (left + POPOVER_WIDTH + MARGIN > viewportWidth) {
      left = viewportWidth - POPOVER_WIDTH - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;

    const fitsBelow = rect.bottom + GAP + POPOVER_EST_HEIGHT <= viewportHeight;
    this.placement.set(fitsBelow ? 'below' : 'above');
    this.top.set(
      fitsBelow
        ? Math.round(rect.bottom + GAP)
        : Math.round(Math.max(MARGIN, rect.top - GAP - POPOVER_EST_HEIGHT)),
    );
    this.left.set(Math.round(left));
    this.caretLeft.set(
      Math.round(Math.max(8, Math.min(rect.left + rect.width / 2 - left, POPOVER_WIDTH - 8))),
    );
  }

  /** Close the popover if the page/list scrolls while it's open, so it never lingers detached. */
  private subscribeScrollClose(): void {
    if (this.scrollCleanup) {
      return;
    }
    const close = (event: Event) => {
      const popover = this.popoverEl();
      if (popover && popover.nativeElement.contains(event.target as Node)) {
        return;
      }
      this.onMouseLeave();
    };
    window.addEventListener('scroll', close, true);
    this.scrollCleanup = () => window.removeEventListener('scroll', close, true);
  }

  protected async ensureLoaded(): Promise<void> {
    const id = this.person().id;
    if (this.loadedFor === id) {
      return;
    }
    this.loadedFor = id;
    this.profile.set(null);
    this.status.set('loading');
    try {
      const [profile] = await Promise.all([
        this.profileService.getProfile(id),
        this.friendsService.ensureLoaded(),
      ]);
      this.profile.set(profile);
      this.status.set(this.friendsService.isFriend(id) ? 'friend' : 'stranger');
    } catch {
      this.status.set('error');
    }
  }

  protected async addFriend(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      return;
    }
    try {
      await this.friendsService.sendFriendRequest(profile.userId);
      this.requestSent.set(true);
    } catch {
      this.requestSent.set(false);
    }
  }
}

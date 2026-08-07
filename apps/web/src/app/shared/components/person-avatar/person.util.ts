import type { UserProfile } from '@lobby/shared';
import { initialsFromName } from '../room-chat';
import type { Person } from './person.model';

/** Map a backend user profile onto the reusable `Person` avatar descriptor. */
export function personFromProfile(profile: UserProfile): Person {
  return {
    id: profile.userId,
    name: profile.displayName,
    initials: initialsFromName(profile.displayName),
  };
}

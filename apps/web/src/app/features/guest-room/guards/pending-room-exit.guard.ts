import type { CanDeactivateFn } from '@angular/router';

export type RoomExitAware = {
  canDeactivate: () => boolean | Promise<boolean>;
};

export const pendingRoomExitGuard: CanDeactivateFn<RoomExitAware> = (component) =>
  component.canDeactivate();

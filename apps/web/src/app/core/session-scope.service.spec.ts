import { SessionScopeService } from './session-scope.service';

describe('SessionScopeService', () => {
  it('invalidates User A work while transitioning and cleaning up for User B', async () => {
    const service = new SessionScopeService();
    const observations: Array<string | null> = [];
    service.registerCleanup(() => {
      observations.push(service.userId());
    });

    await service.transitionTo('user-a');
    const userARequest = service.capture();
    await service.transitionTo('user-b');

    expect(service.isCurrent(userARequest)).toBe(false);
    expect(service.userId()).toBe('user-b');
    expect(observations).toEqual(['user-a', 'user-b']);
  });

  it('does not reset state for a same-account access-token refresh', async () => {
    const service = new SessionScopeService();
    const cleanup = vi.fn();
    service.registerCleanup(cleanup);

    await service.transitionTo('user-a');
    cleanup.mockClear();
    const scope = service.capture();
    await service.transitionTo('user-a');

    expect(cleanup).not.toHaveBeenCalled();
    expect(service.isCurrent(scope)).toBe(true);
  });
});

import { AuthService } from './auth.service';

describe('AuthService password flows', () => {
  const session = {
    access_token: 'access',
    refresh_token: 'refresh',
    user: { id: 'user-id' },
  };

  it('requires the current password for a signed-in password change', async () => {
    const updateUser = jest.fn().mockResolvedValue({ data: { user: session.user }, error: null });
    const service = serviceWith(updateUser);

    await service.changePassword(
      {
        currentPassword: 'old-password',
        password: 'new-password',
        confirmPassword: 'new-password',
      },
      'access',
      'refresh',
    );

    expect(updateUser).toHaveBeenCalledWith({
      password: 'new-password',
      current_password: 'old-password',
    });
  });

  it('keeps recovery reset separate from current-password verification', async () => {
    const updateUser = jest.fn().mockResolvedValue({ data: { user: session.user }, error: null });
    const service = serviceWith(updateUser);

    await service.resetPassword(
      { password: 'new-password', confirmPassword: 'new-password' },
      'access',
      'refresh',
    );

    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  function serviceWith(updateUser: jest.Mock): AuthService {
    const authClient = {
      auth: {
        setSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
        updateUser,
      },
    };
    return new AuthService(
      { createAuthClient: () => authClient } as never,
      { ensureProfile: jest.fn() } as never,
    );
  }
});

import { NotFoundException } from '@nestjs/common';

import { UsersService } from './users.service';

describe('UsersService profile reads', () => {
  it('returns 404 without creating a missing profile', async () => {
    const repository = {
      findProfile: jest.fn().mockResolvedValue(null),
      ensureProfile: jest.fn(),
    };
    const service = new UsersService(repository as never);

    await expect(service.getProfile('missing-user')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.ensureProfile).not.toHaveBeenCalled();
  });
});

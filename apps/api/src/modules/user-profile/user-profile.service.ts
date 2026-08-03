import { Injectable } from '@nestjs/common';
import type { UpdateUserProfileRequest, UserProfile } from '@lobby/shared';
import { UserProfileRepository } from './user-profile.repository';

@Injectable()
export class UserProfileService {
  constructor(private readonly userProfileRepository: UserProfileRepository) {}

  findProfile(userId: string): Promise<UserProfile> {
    return this.userProfileRepository.findProfile(userId);
  }

  updateProfile(userId: string, payload: UpdateUserProfileRequest): Promise<UserProfile> {
    return this.userProfileRepository.updateProfile(userId, payload);
  }
}

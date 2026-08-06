import { BadRequestException, Injectable } from '@nestjs/common';
import type { UpdateUserProfileRequest, UploadUserAvatarRequest, UserProfile } from '@lobby/shared';
import { MAX_AVATAR_FILE_SIZE_BYTES } from '@lobby/shared';
import { UsersRepository } from './users.repository';
import { toUserProfile } from './users.mappers';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  getProfile(userId: string): Promise<UserProfile> {
    return this.usersRepository.findOrCreateProfile(userId);
  }

  updateProfile(userId: string, changes: UpdateUserProfileRequest): Promise<UserProfile> {
    // avatarUrl is intentionally not settable here — it only changes via the
    // dedicated upload/delete endpoints, which own the storage object too.
    return this.usersRepository.updateProfile(userId, {
      displayName: changes.displayName,
      bio: changes.bio,
    });
  }

  async uploadAvatar(userId: string, payload: UploadUserAvatarRequest): Promise<UserProfile> {
    const buffer = Buffer.from(payload.data, 'base64');

    if (buffer.byteLength > MAX_AVATAR_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Avatar must be ${Math.floor(MAX_AVATAR_FILE_SIZE_BYTES / (1024 * 1024))}MB or smaller.`,
      );
    }

    // Clear out any previously stored file first so a switch between
    // extensions (e.g. .png -> .jpg) doesn't leave an orphaned object behind.
    await this.usersRepository.deleteAvatarFiles(userId);

    const avatarUrl = await this.usersRepository.uploadAvatar(
      userId,
      payload.fileName,
      payload.contentType,
      buffer,
    );

    return this.usersRepository.updateAvatarUrl(userId, avatarUrl);
  }

  async deleteAvatar(userId: string): Promise<UserProfile> {
    await this.usersRepository.deleteAvatarFiles(userId);
    return this.usersRepository.updateAvatarUrl(userId, null);
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];
    const rows = await this.usersRepository.searchByName(trimmed);
    return rows.map(toUserProfile);
  }
}

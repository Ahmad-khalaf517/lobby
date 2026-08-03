import type { UpdateUserProfileRequest, UserProfile } from '@lobby/shared';
import type { UserProfileInsert, UserProfileRow } from '../database/database.types';

export function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toUserProfileInsert(
  userId: string,
  payload: UpdateUserProfileRequest,
): UserProfileInsert {
  if (payload.displayName === undefined) {
    throw new Error('displayName is required for profile creation');
  }

  return {
    user_id: userId,
    display_name: payload.displayName,
    ...(payload.bio !== undefined ? { bio: payload.bio } : {}),
    ...(payload.avatarUrl !== undefined ? { avatar_url: payload.avatarUrl } : {}),
  };
}

export function toUserProfileUpdate(payload: UpdateUserProfileRequest): Partial<UserProfileInsert> {
  return {
    ...(payload.displayName !== undefined ? { display_name: payload.displayName } : {}),
    ...(payload.bio !== undefined ? { bio: payload.bio } : {}),
    ...(payload.avatarUrl !== undefined ? { avatar_url: payload.avatarUrl } : {}),
  };
}

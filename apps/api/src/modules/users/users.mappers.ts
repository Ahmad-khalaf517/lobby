import type { UserProfile } from '@lobby/shared';
import type { Database } from '../../database/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];

export function toUserProfile(row: UserRow): UserProfile {
  return {
    userId: row.id,
    displayName: row.name,
    username: row.user_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

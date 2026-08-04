import type { AuthUser } from '@lobby/shared';
import type { User } from '@supabase/supabase-js';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    userMetadata: user.user_metadata,
  };
}

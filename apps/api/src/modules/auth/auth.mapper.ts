import type { AuthUser } from '@lobby/shared';
import type { User } from '@supabase/supabase-js';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email?.trim() ? user.email : null,
    isAnonymous: user.is_anonymous === true,
    userMetadata: user.user_metadata,
  };
}

import type { Database as PublicDatabase } from './database.types';
import type { Database as GuestDatabase } from './guest-database.types';

/** Generated public and guest schema types composed for one Supabase client. */
export type Database = PublicDatabase & Pick<GuestDatabase, 'guest'>;

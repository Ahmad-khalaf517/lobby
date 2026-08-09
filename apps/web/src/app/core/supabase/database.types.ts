import type { Database as PublicDatabase } from '../../../../../api/src/database/database.types';
import type { Database as GuestDatabase } from '../../../../../api/src/database/guest-database.types';

/** Generated public and guest schema types composed for the browser client. */
export type Database = PublicDatabase & Pick<GuestDatabase, 'guest'>;

export type GuestChannelBlock = GuestDatabase['guest']['Tables']['channel_blocks']['Row'];
export type GuestChannel = GuestDatabase['guest']['Tables']['channels']['Row'];
export type GuestChannelMember = GuestDatabase['guest']['Tables']['channel_members']['Row'];
export type GuestMessage = GuestDatabase['guest']['Tables']['messages']['Row'];
export type GuestMessageReaction = GuestDatabase['guest']['Tables']['message_reactions']['Row'];

export type DmConversationRow = PublicDatabase['public']['Tables']['dm_conversations']['Row'];
export type DmMessageRow = PublicDatabase['public']['Tables']['dm_messages']['Row'];
export type NotificationRow = PublicDatabase['public']['Tables']['notifications']['Row'];

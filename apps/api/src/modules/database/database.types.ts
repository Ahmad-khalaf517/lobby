/**
 * Database row types — the shape Supabase actually returns.
 *
 * These are Postgres rows (snake_case), NOT the API contract. The contract
 * lives in @lobby/shared and is camelCase. Everything crossing the
 * boundary out of this folder must go through a mapper in ./mappers.ts —
 * a snake_case field should never reach apps/web.
 *
 * Declared with `type`, not `interface`: @supabase/postgrest-js's generic
 * constraints require each Row/Insert/Update to structurally satisfy
 * `Record<string, unknown>`, which plain `interface` declarations don't
 * (they lack the implicit index signature `type` object literals get) —
 * using `interface` here silently collapses every query's payload type to
 * `never`. This is also why `supabase gen types typescript` itself always
 * emits `type`, never `interface`.
 *
 * You can regenerate this file from your live schema instead of hand-editing:
 *   pnpm dlx supabase gen types typescript --project-id <your-id> > database.types.ts
 */

export type ChannelRow = {
  id: string;
  name: string;
  created_at: string;
  expires_at: string | null;
};

/**
 * A message's author is a `channel_members` row, not a free-text name — see
 * ChannelMemberRow below. `sender_id` is embedded via a PostgREST resource
 * embed (`channel_members(guest_name,user_id)`) so the API layer can resolve
 * a display name without a second round trip; see channels.mappers.ts.
 */
export type MessageRow = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  channel_members: Pick<ChannelMemberRow, 'guest_name' | 'user_id'> | null;
};

/**
 * A channel membership — one row per join (guest or authenticated). Rows are
 * never deleted, only closed via `left_at`, so `messages.sender_id` always
 * resolves even after someone leaves. `livekit_identity` is required by the
 * live schema (NOT NULL, no default) — apps/api mints one per join so a
 * future call-token endpoint has a stable identity to bind to.
 */
export type ChannelMemberRow = {
  id: string;
  channel_id: string;
  user_id: string | null;
  guest_name: string | null;
  role: string;
  livekit_identity: string;
  joined_at: string;
  left_at: string | null;
};

/** Insert shapes — columns with database defaults are omitted. */
export type ChannelInsert = {
  id: string;
  name: string;
  expires_at?: string | null;
};

export type MessageInsert = {
  channel_id: string;
  sender_id: string;
  content: string;
};

export type ChannelMemberInsert = {
  channel_id: string;
  guest_name: string;
  livekit_identity: string;
};

/** Typed Supabase client schema, so `.from('channels')` is type-checked. */
export type Database = {
  public: {
    Tables: {
      channels: {
        Row: ChannelRow;
        Insert: ChannelInsert;
        Update: Partial<ChannelInsert>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: Partial<MessageInsert>;
        Relationships: [];
      };
      channel_members: {
        Row: ChannelMemberRow;
        Insert: ChannelMemberInsert;
        Update: Partial<ChannelMemberInsert> & { left_at?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

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

export type MessageRow = {
  id: string;
  channel_id: string;
  author_name: string;
  text: string;
  created_at: string;
};

export type UserProfileRow = {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Insert shapes — columns with database defaults are omitted. */
export type ChannelInsert = {
  id: string;
  name: string;
  expires_at?: string | null;
};

export type MessageInsert = {
  channel_id: string;
  author_name: string;
  text: string;
};

export type UserProfileInsert = {
  user_id: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
};

export type AccountSettingsRow = {
  user_id: string;
  email_notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountSettingsInsert = {
  user_id: string;
  email_notifications_enabled: boolean;
  push_notifications_enabled: boolean;
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
      user_profiles: {
        Row: UserProfileRow;
        Insert: UserProfileInsert;
        Update: Partial<UserProfileInsert>;
        Relationships: [];
      };
      account_settings: {
        Row: AccountSettingsRow;
        Insert: AccountSettingsInsert;
        Update: Partial<AccountSettingsInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

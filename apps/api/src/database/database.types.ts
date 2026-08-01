/**
 * Database row types — the shape Supabase actually returns.
 *
 * These are Postgres rows (snake_case), NOT the API contract. The contract
 * lives in @lobby/shared and is camelCase. Everything crossing the
 * boundary out of this folder must go through a mapper in ./mappers.ts —
 * a snake_case field should never reach apps/web.
 *
 * You can regenerate this file from your live schema instead of hand-editing:
 *   pnpm dlx supabase gen types typescript --project-id <your-id> > database.types.ts
 */

export interface ChannelRow {
  id: string;
  name: string;
  created_at: string;
  expires_at: string | null;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

/** Insert shapes — columns with database defaults are omitted. */
export interface ChannelInsert {
  id: string;
  name: string;
  expires_at?: string | null;
}

export interface MessageInsert {
  channel_id: string;
  author_name: string;
  text: string;
}

/** Typed Supabase client schema, so `.from('channels')` is type-checked. */
export interface Database {
  public: {
    Tables: {
      channels: {
        Row: ChannelRow;
        Insert: ChannelInsert;
        Update: Partial<ChannelInsert>;
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: Partial<MessageInsert>;
      };
    };
  };
}

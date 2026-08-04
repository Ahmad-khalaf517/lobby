import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database/database.types';

/**
 * Wraps a single Supabase client for the whole app.
 *
 * Uses the SERVICE_ROLE key, which bypasses Row Level Security. That is
 * deliberate — this app has no user auth, so there is no authenticated
 * Supabase user to write policies against. Access control is enforced here
 * in NestJS instead ("do you know the channel id?").
 *
 * Consequence: this key must never reach the browser. It lives only in the
 * server environment. If it leaks, anyone can read and delete every room.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private _client!: SupabaseClient<Database>;

  onModuleInit(): void {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Copy .env.example to .env and fill them in.',
      );
    }

    this._client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  get client(): SupabaseClient<Database> {
    return this._client;
  }
}

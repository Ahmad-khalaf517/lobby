import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database/app-database.types';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private _adminClient!: SupabaseClient<Database>;

  private supabaseUrl!: string;
  private publishableKey!: string;

  onModuleInit(): void {
    const url = process.env.SUPABASE_URL;

    const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (!url || !adminKey || !publishableKey) {
      throw new Error('SUPABASE_URL, an admin key, and a publishable/anon key must be set.');
    }

    this.supabaseUrl = url;
    this.publishableKey = publishableKey;

    // Elevated client for trusted database operations.
    this._adminClient = createClient<Database>(url, adminKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  /**
   * Existing repositories can continue using this client.
   * It bypasses RLS, so NestJS must enforce authorization.
   */
  get client(): SupabaseClient<Database> {
    return this._adminClient;
  }

  /** Create a fresh, non-persistent client for one auth operation. */
  createAuthClient(): SupabaseClient<Database> {
    return createClient<Database>(this.supabaseUrl, this.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  /** Create a request-scoped client that preserves the caller's auth.uid() for RLS/RPCs. */
  createUserClient(accessToken: string): SupabaseClient<Database> {
    return createClient<Database>(this.supabaseUrl, this.publishableKey, {
      accessToken: async () => accessToken,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
}

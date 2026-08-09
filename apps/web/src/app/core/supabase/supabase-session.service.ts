import { Injectable, signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import type { Database } from './database.types';

@Injectable({ providedIn: 'root' })
export class SupabaseSessionService {
  private accessToken: string | null = null;
  private readonly authRevision = signal(0);

  readonly tokenRevision = this.authRevision.asReadonly();

  readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      accessToken: async () => this.accessToken,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  async setAccessToken(accessToken: string): Promise<void> {
    this.accessToken = accessToken;
    await this.client.realtime.setAuth(accessToken);
    this.authRevision.update((revision) => revision + 1);
  }

  async clearSession(): Promise<void> {
    this.accessToken = null;
    await this.client.removeAllChannels();
    await this.client.realtime.setAuth(null);
    this.authRevision.update((revision) => revision + 1);
  }
}

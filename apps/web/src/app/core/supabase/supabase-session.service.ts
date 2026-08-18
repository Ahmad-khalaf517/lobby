import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import type { Database } from './database.types';

/** Owns the one browser Supabase client and its native persisted Auth session. */
@Injectable({ providedIn: 'root' })
export class SupabaseSessionService {
  private readonly authRevision = signal(0);
  private readonly recoveryRedirect = signal(false);

  readonly client: SupabaseClient<Database>;
  readonly tokenRevision = this.authRevision.asReadonly();
  readonly hasPasswordRecoverySession = this.recoveryRedirect.asReadonly();

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    this.client = createClient<Database>(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
      {
        auth: {
          persistSession: browser,
          autoRefreshToken: browser,
          detectSessionInUrl: browser,
        },
      },
    );

    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.recoveryRedirect.set(true);
      if (event === 'SIGNED_OUT') this.recoveryRedirect.set(false);
      void this.synchronizeRealtime(session?.access_token ?? null);
    });
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.access_token ?? null;
  }

  finishPasswordRecovery(): void {
    this.recoveryRedirect.set(false);
  }

  private async synchronizeRealtime(accessToken: string | null): Promise<void> {
    if (!accessToken) await this.client.removeAllChannels();
    await this.client.realtime.setAuth(accessToken);
    this.authRevision.update((revision) => revision + 1);
  }
}

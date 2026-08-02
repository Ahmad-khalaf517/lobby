import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/supabase';
import { RegisterInput } from '../schemas/register.schema';

type RegisterCredentials = Pick<RegisterInput, 'name' | 'email' | 'password'>;

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  login(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  register({ name, email, password }: RegisterCredentials) {
    const options = {
      data: { name },
      ...(isPlatformBrowser(this.platformId)
        ? { emailRedirectTo: `${this.document.location.origin}/auth/confirm` }
        : {}),
    };

    return this.supabase.auth.signUp({
      email,
      password,
      options,
    });
  }

  getSession() {
    return this.supabase.auth.getSession();
  }

  onAuthStateChange(callback: (session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange((_event, session) => callback(session)).data
      .subscription;
  }

  requestPasswordReset(email: string) {
    const redirectTo = isPlatformBrowser(this.platformId)
      ? `${this.document.location.origin}/auth/reset-password`
      : undefined;

    return this.supabase.auth.resetPasswordForEmail(email, {
      ...(redirectTo ? { redirectTo } : {}),
    });
  }

  updatePassword(password: string) {
    return this.supabase.auth.updateUser({ password });
  }

  logout() {
    return this.supabase.auth.signOut();
  }
}

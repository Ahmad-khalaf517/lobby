import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { LoginDto } from './dto/login.dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async login(dto: LoginDto) {
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  async getCurrentUser(accessToken: string) {
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return {
      user: data.user,
    };
  }

  async refreshSession(refreshToken: string) {
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Session could not be refreshed');
    }

    return {
      user: data.user,
      session: data.session,
    };
  }
}

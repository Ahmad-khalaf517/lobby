import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateUserProfileRequest, UserProfile } from '@lobby/shared';
import { SupabaseService } from '../database/supabase.service';
import { toUserProfile, toUserProfileInsert, toUserProfileUpdate } from './user-profile.mappers';

@Injectable()
export class UserProfileRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select()
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('User profile not found');
    return toUserProfile(data);
  }

  async updateProfile(userId: string, payload: UpdateUserProfileRequest): Promise<UserProfile> {
    const { data: existingProfile, error: existingProfileError } = await this.supabase.client
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;
    if (!existingProfile && payload.displayName === undefined) {
      throw new BadRequestException('displayName is required when creating a profile');
    }

    if (existingProfile) {
      const { data, error } = await this.supabase.client
        .from('user_profiles')
        .update(toUserProfileUpdate(payload))
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return toUserProfile(data);
    }

    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .insert(toUserProfileInsert(userId, payload))
      .select()
      .single();

    if (error) throw error;
    return toUserProfile(data);
  }
}

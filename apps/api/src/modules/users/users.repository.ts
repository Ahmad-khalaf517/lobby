import { Injectable } from '@nestjs/common';
import type { UserProfile } from '@lobby/shared';
import type { Database } from '../../database/database.types';
import { SupabaseService } from '../database/supabase.service';
import { toUserProfile } from './users.mappers';

type UserRow = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type UserUpdate = Database['public']['Tables']['users']['Update'];

const AVATAR_BUCKET = 'avatars';

@Injectable()
export class UsersRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Profiles are scaffolded lazily: the first time a user is looked up
   * with no row yet, one is created with sane defaults. Mirrors
   * ServersRepository#ensureUserExists so both modules stay consistent.
   */
  async findOrCreateProfile(userId: string): Promise<UserProfile> {
    const existing = await this.findRow(userId);
    if (existing) {
      return toUserProfile(existing);
    }

    const fallbackName = `User ${userId.slice(0, 8)}`;
    const insert: UserInsert = {
      id: userId,
      name: fallbackName,
      user_name: fallbackName.toLowerCase().replace(/\s+/g, '_'),
    };

    const { data, error } = await this.supabase.client
      .from('users')
      .upsert(insert, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return toUserProfile(data);
  }

  async updateProfile(
    userId: string,
    changes: { displayName?: string; bio?: string | null; userName?: string },
  ): Promise<UserProfile> {
    // Make sure the row exists before updating (first save for this account).
    await this.findOrCreateProfile(userId);

    const update: UserUpdate = {};
    if (changes.displayName !== undefined) update.name = changes.displayName;
    if (changes.bio !== undefined) update.bio = changes.bio;
    if (changes.userName !== undefined) update.user_name = changes.userName;

    const { data, error } = await this.supabase.client
      .from('users')
      .update(update)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return toUserProfile(data);
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<UserProfile> {
    await this.findOrCreateProfile(userId);

    const update: UserUpdate = { avatar_url: avatarUrl };
    const { data, error } = await this.supabase.client
      .from('users')
      .update(update)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return toUserProfile(data);
  }

  /** Uploads the avatar to Supabase Storage and returns its public URL. */
  async uploadAvatar(
    userId: string,
    fileName: string,
    contentType: string,
    buffer: Buffer,
  ): Promise<string> {
    const extension = fileName.includes('.')
      ? fileName.split('.').pop()
      : contentType.split('/')[1];
    // One object per user (upsert) — new uploads simply overwrite the old file in place.
    const path = `${userId}/avatar.${extension ?? 'png'}`;

    const { error } = await this.supabase.client.storage.from(AVATAR_BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (error) throw error;

    const { data } = this.supabase.client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // Cache-bust so the new avatar shows up immediately even though the path is stable.
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async deleteAvatarFiles(userId: string): Promise<void> {
    const { data: files, error: listError } = await this.supabase.client.storage
      .from(AVATAR_BUCKET)
      .list(userId);

    if (listError) throw listError;
    if (!files || files.length === 0) return;

    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error } = await this.supabase.client.storage.from(AVATAR_BUCKET).remove(paths);
    if (error) throw error;
  }
  async searchByNameOrUserName(query: string, limit = 20): Promise<UserRow[]> {
    const pattern = `%${query}%`;
    const { data, error } = await this.supabase.client
      .from('users')
      .select()
      .or(`name.ilike.${pattern},user_name.ilike.${pattern}`)
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  private async findRow(userId: string): Promise<UserRow | null> {
    const { data, error } = await this.supabase.client
      .from('users')
      .select()
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

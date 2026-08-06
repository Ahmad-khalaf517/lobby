import { Injectable } from '@nestjs/common';
import type { FriendshipStatus } from '@lobby/shared';
import type { Database } from '../../database/database.types';
import { SupabaseService } from '../database/supabase.service';
import type { UserRow } from './friendships.mappers';

type FriendshipRow = Database['public']['Tables']['friendships']['Row'];
type FriendshipInsert = Database['public']['Tables']['friendships']['Insert'];
type FriendshipUpdate = Database['public']['Tables']['friendships']['Update'];

@Injectable()
export class FriendshipsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Finds the single relationship row between two users, in either direction. */
  async findPairwise(userAId: string, userBId: string): Promise<FriendshipRow | null> {
    const { data, error } = await this.db
      .from('friendships')
      .select()
      .or(
        `and(requester_id.eq.${userAId},addressee_id.eq.${userBId}),and(requester_id.eq.${userBId},addressee_id.eq.${userAId})`,
      )
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findById(friendshipId: string): Promise<FriendshipRow | null> {
    const { data, error } = await this.db
      .from('friendships')
      .select()
      .eq('id', friendshipId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createRequest(requesterId: string, addresseeId: string): Promise<FriendshipRow> {
    const insert: FriendshipInsert = {
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
    };

    const { data, error } = await this.db.from('friendships').insert(insert).select().single();
    if (error) throw error;
    return data;
  }

  /** Fresh `blocked` row for a pair with no prior relationship. */
  async createBlock(blockerId: string, blockedUserId: string): Promise<FriendshipRow> {
    const insert: FriendshipInsert = {
      requester_id: blockerId,
      addressee_id: blockedUserId,
      status: 'blocked',
      blocked_by: blockerId,
    };

    const { data, error } = await this.db.from('friendships').insert(insert).select().single();
    if (error) throw error;
    return data;
  }

  async updateStatus(
    friendshipId: string,
    status: FriendshipStatus,
    blockedBy: string | null = null,
  ): Promise<FriendshipRow> {
    const update: FriendshipUpdate = { status, blocked_by: blockedBy };

    const { data, error } = await this.db
      .from('friendships')
      .update(update)
      .eq('id', friendshipId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(friendshipId: string): Promise<void> {
    const { error } = await this.db.from('friendships').delete().eq('id', friendshipId);
    if (error) throw error;
  }

  /** All rows involving this user, optionally filtered to one status. */
  async listForUser(userId: string, status?: FriendshipStatus): Promise<FriendshipRow[]> {
    let query = this.db
      .from('friendships')
      .select()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async listIncomingRequests(userId: string): Promise<FriendshipRow[]> {
    const { data, error } = await this.db
      .from('friendships')
      .select()
      .eq('addressee_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async listOutgoingRequests(userId: string): Promise<FriendshipRow[]> {
    const { data, error } = await this.db
      .from('friendships')
      .select()
      .eq('requester_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  /** Rows where *this* user performed the block (not rows where they were blocked). */
  async listBlockedByUser(userId: string): Promise<FriendshipRow[]> {
    const { data, error } = await this.db
      .from('friendships')
      .select()
      .eq('status', 'blocked')
      .eq('blocked_by', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  /** Batch profile lookup for the "other users" in a list — one query, no N+1. */
  async findUsersByIds(ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.db
      .from('users')
      .select('id, name, user_name, avatar_url')
      .in('id', ids);

    if (error) throw error;
    return (data ?? []) as UserRow[];
  }
}

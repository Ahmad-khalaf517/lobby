import type { Database } from './database.types';

export type ChannelInsert = Database['public']['Tables']['channels']['Insert'];
export type ChannelUpdate = Database['public']['Tables']['channels']['Update'];
export type ChannelRow = Database['public']['Tables']['channels']['Row'];

export type ServerInsert = Database['public']['Tables']['servers']['Insert'];
export type ServerUpdate = Database['public']['Tables']['servers']['Update'];
export type ServerMemberInsert = Database['public']['Tables']['server_members']['Insert'];
export type ServerMemberRow = Database['public']['Tables']['server_members']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];

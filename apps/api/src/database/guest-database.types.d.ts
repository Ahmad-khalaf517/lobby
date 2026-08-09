export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  guest: {
    Tables: {
      channel_members: {
        Row: {
          channel_id: string;
          created_at: string;
          display_name: string;
          id: string;
          joined_at: string;
          last_joined_at: string;
          last_seen_at: string;
          left_at: string | null;
          livekit_identity: string;
          removed_at: string | null;
          removed_reason: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          display_name: string;
          id?: string;
          joined_at?: string;
          last_joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          livekit_identity: string;
          removed_at?: string | null;
          removed_reason?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          joined_at?: string;
          last_joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          livekit_identity?: string;
          removed_at?: string | null;
          removed_reason?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'channel_members_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
        ];
      };
      channels: {
        Row: {
          code: string;
          created_at: string;
          empty_since: string | null;
          ended_at: string | null;
          ended_reason: Database['guest']['Enums']['channel_end_reason'] | null;
          expires_at: string;
          id: string;
          last_activity_at: string;
          livekit_room_name: string;
          max_members: number;
          name: string;
          owner_member_id: string | null;
          status: Database['guest']['Enums']['channel_status'];
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          empty_since?: string | null;
          ended_at?: string | null;
          ended_reason?: Database['guest']['Enums']['channel_end_reason'] | null;
          expires_at?: string;
          id?: string;
          last_activity_at?: string;
          livekit_room_name: string;
          max_members?: number;
          name: string;
          owner_member_id?: string | null;
          status?: Database['guest']['Enums']['channel_status'];
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          empty_since?: string | null;
          ended_at?: string | null;
          ended_reason?: Database['guest']['Enums']['channel_end_reason'] | null;
          expires_at?: string;
          id?: string;
          last_activity_at?: string;
          livekit_room_name?: string;
          max_members?: number;
          name?: string;
          owner_member_id?: string | null;
          status?: Database['guest']['Enums']['channel_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_channels_owner_member_fk';
            columns: ['id', 'owner_member_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['channel_id', 'id'];
          },
        ];
      };
      message_reactions: {
        Row: {
          channel_id: string;
          created_at: string;
          emoji: string;
          member_id: string;
          message_id: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          emoji: string;
          member_id: string;
          message_id: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          emoji?: string;
          member_id?: string;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_message_reactions_channel_fk';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_message_reactions_member_fk';
            columns: ['channel_id', 'member_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['channel_id', 'id'];
          },
          {
            foreignKeyName: 'guest_message_reactions_message_fk';
            columns: ['channel_id', 'message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['channel_id', 'id'];
          },
        ];
      };
      messages: {
        Row: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_member_id: string | null;
          type: Database['guest']['Enums']['message_type'];
          updated_at: string;
        };
        Insert: {
          channel_id: string;
          client_message_id?: string | null;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          reply_to?: string | null;
          sender_member_id?: string | null;
          type?: Database['guest']['Enums']['message_type'];
          updated_at?: string;
        };
        Update: {
          channel_id?: string;
          client_message_id?: string | null;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          reply_to?: string | null;
          sender_member_id?: string | null;
          type?: Database['guest']['Enums']['message_type'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_messages_reply_fk';
            columns: ['channel_id', 'reply_to'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['channel_id', 'id'];
          },
          {
            foreignKeyName: 'guest_messages_sender_fk';
            columns: ['channel_id', 'sender_member_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['channel_id', 'id'];
          },
          {
            foreignKeyName: 'messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cleanup_stale_anonymous_users: {
        Args: {
          p_batch_size?: number;
          p_retention?: string;
        };
        Returns: number;
      };
      close_channel: {
        Args: {
          p_channel_id: string;
        };
        Returns: undefined;
      };
      create_channel: {
        Args: {
          p_display_name?: string;
          p_lifetime_minutes?: number;
          p_max_members?: number;
          p_name: string;
        };
        Returns: {
          channel_id: string;
          code: string;
          expires_at: string;
          livekit_room_name: string;
          member_id: string;
        }[];
      };
      create_message: {
        Args: {
          p_channel_id: string;
          p_client_message_id?: string;
          p_content: string;
          p_reply_to?: string;
          p_type?: Database['guest']['Enums']['message_type'];
        };
        Returns: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_member_id: string | null;
          type: Database['guest']['Enums']['message_type'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_member_id: {
        Args: {
          p_channel_id: string;
        };
        Returns: string;
      };
      delete_message: {
        Args: {
          p_channel_id: string;
          p_message_id: string;
        };
        Returns: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_member_id: string | null;
          type: Database['guest']['Enums']['message_type'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      edit_message: {
        Args: {
          p_channel_id: string;
          p_content: string;
          p_message_id: string;
        };
        Returns: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_member_id: string | null;
          type: Database['guest']['Enums']['message_type'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expire_due_channels: {
        Args: {
          p_empty_grace_minutes?: number;
        };
        Returns: {
          channel_id: string;
          ended_reason: Database['guest']['Enums']['channel_end_reason'];
          livekit_room_name: string;
        }[];
      };
      generate_channel_code: {
        Args: never;
        Returns: string;
      };
      is_active_channel_member: {
        Args: {
          p_channel_id: string;
        };
        Returns: boolean;
      };
      join_channel: {
        Args: {
          p_code: string;
          p_display_name?: string;
        };
        Returns: {
          channel_id: string;
          expires_at: string;
          livekit_room_name: string;
          member_id: string;
          rejoined: boolean;
        }[];
      };
      leave_channel: {
        Args: {
          p_channel_id: string;
        };
        Returns: undefined;
      };
      purge_ended_channels: {
        Args: {
          p_retention_minutes?: number;
        };
        Returns: number;
      };
      requester_is_anonymous: {
        Args: never;
        Returns: boolean;
      };
      resolve_requester_display_name: {
        Args: {
          p_requested_display_name?: string;
        };
        Returns: string;
      };
      toggle_message_reaction: {
        Args: {
          p_channel_id: string;
          p_emoji: string;
          p_message_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      channel_end_reason: 'expired' | 'closed_by_owner' | 'empty' | 'moderation';
      channel_status: 'active' | 'expired' | 'ended';
      message_type: 'text' | 'system' | 'file' | 'image';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;
export declare const Constants: {
  readonly guest: {
    readonly Enums: {
      readonly channel_end_reason: readonly ['expired', 'closed_by_owner', 'empty', 'moderation'];
      readonly channel_status: readonly ['active', 'expired', 'ended'];
      readonly message_type: readonly ['text', 'system', 'file', 'image'];
    };
  };
};
export {};

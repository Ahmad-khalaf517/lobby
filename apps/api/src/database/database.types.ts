export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
/**
 * A channel membership — one row per join (guest or authenticated). Rows are
 * never deleted, only closed via `left_at`, so `messages.sender_id` always
 * resolves even after someone leaves. `livekit_identity` is required by the
 * live schema (NOT NULL, no default) — apps/api mints one per join so a
 * future call-token endpoint has a stable identity to bind to.
 */
export type ChannelMemberRow = {
  id: string;
  channel_id: string;
  user_id: string | null;
  guest_name: string | null;
  role: string;
  livekit_identity: string;
  joined_at: string;
  left_at: string | null;
};

export type MessageReactionRow = {
  id: string;
  message_id: string;
  channel_member_id: string;
  emoji: string;
  created_at: string;
  updated_at: string;
  channel_members: ChannelMemberRow;
};

export type MessageReactionInsert = {
  message_id: string;
  channel_member_id: string;
  emoji: string;
};
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account_setting_definitions: {
        Row: {
          category: string;
          created_at: string;
          default_value: Json;
          description: string | null;
          is_active: boolean;
          label: string;
          options: Json | null;
          setting_key: string;
          sort_order: number;
          updated_at: string;
          value_type: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          default_value: Json;
          description?: string | null;
          is_active?: boolean;
          label: string;
          options?: Json | null;
          setting_key: string;
          sort_order?: number;
          updated_at?: string;
          value_type: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          default_value?: Json;
          description?: string | null;
          is_active?: boolean;
          label?: string;
          options?: Json | null;
          setting_key?: string;
          sort_order?: number;
          updated_at?: string;
          value_type?: string;
        };
        Relationships: [];
      };
      account_settings: {
        Row: {
          created_at: string;
          setting_key: string;
          updated_at: string;
          user_id: string;
          value: Json;
        };
        Insert: {
          created_at?: string;
          setting_key: string;
          updated_at?: string;
          user_id: string;
          value: Json;
        };
        Update: {
          created_at?: string;
          setting_key?: string;
          updated_at?: string;
          user_id?: string;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'account_settings_setting_key_fkey';
            columns: ['setting_key'];
            isOneToOne: false;
            referencedRelation: 'account_setting_definitions';
            referencedColumns: ['setting_key'];
          },
          {
            foreignKeyName: 'account_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      channel_members: {
        Row: {
          channel_id: string;
          guest_name: string | null;
          id: string;
          joined_at: string;
          left_at: string | null;
          livekit_identity: string;
          role: string;
          user_id: string | null;
        };
        Insert: {
          channel_id: string;
          guest_name?: string | null;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          livekit_identity: string;
          role?: string;
          user_id?: string | null;
        };
        Update: {
          channel_id?: string;
          guest_name?: string | null;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          livekit_identity?: string;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'channel_members_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'channel_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      channels: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          name: string;
          server_id: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id: string;
          name: string;
          server_id?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          name?: string;
          server_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'channels_server_id_fkey';
            columns: ['server_id'];
            isOneToOne: false;
            referencedRelation: 'servers';
            referencedColumns: ['id'];
          },
        ];
      };
      dm_conversations: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          user_a_id: string;
          user_b_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_a_id: string;
          user_b_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_a_id?: string;
          user_b_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dm_conversations_user_a_id_fkey';
            columns: ['user_a_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dm_conversations_user_b_id_fkey';
            columns: ['user_b_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      dm_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          reaction_emoji: string | null;
          sender_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          reaction_emoji?: string | null;
          sender_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          reaction_emoji?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dm_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'dm_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dm_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      friendships: {
        Row: {
          addressee_id: string;
          blocked_by: string | null;
          created_at: string;
          id: string;
          requester_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          addressee_id: string;
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          addressee_id?: string;
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friendships_addressee_id_fkey';
            columns: ['addressee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_blocked_by_fkey';
            columns: ['blocked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reactions: {
        Row: {
          channel_member_id: string;
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          updated_at: string;
        };
        Insert: {
          channel_member_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          updated_at?: string;
        };
        Update: {
          channel_member_id?: string;
          created_at?: string;
          emoji?: string;
          id?: string;
          message_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_channel_member_id_fkey';
            columns: ['channel_member_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          channel_id: string;
          content: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          channel_id: string;
          content: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          channel_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          channel_id: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          message_id: string | null;
          read_at: string | null;
          server_id: string | null;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        Insert: {
          body: string;
          channel_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message_id?: string | null;
          read_at?: string | null;
          server_id?: string | null;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        Update: {
          body?: string;
          channel_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message_id?: string | null;
          read_at?: string | null;
          server_id?: string | null;
          title?: string;
          type?: Database['public']['Enums']['notification_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_server_id_fkey';
            columns: ['server_id'];
            isOneToOne: false;
            referencedRelation: 'servers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      server_members: {
        Row: {
          id: string;
          joined_at: string;
          role: string;
          server_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          role?: string;
          server_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          role?: string;
          server_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'server_members_server_id_fkey';
            columns: ['server_id'];
            isOneToOne: false;
            referencedRelation: 'servers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'server_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      servers: {
        Row: {
          created_at: string;
          id: string;
          invite_code: string;
          name: string;
          owner_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invite_code: string;
          name: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invite_code?: string;
          name?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'servers_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_name: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          id: string;
          name: string;
          updated_at?: string;
          user_name: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      guest_room_end_reason: 'expired' | 'closed_by_owner' | 'empty' | 'moderation';
      guest_room_message_type: 'text' | 'system' | 'file' | 'image';
      guest_room_status: 'active' | 'expired' | 'ended';
      notification_type:
        | 'friend_request'
        | 'friend_accept'
        | 'server_invite'
        | 'channel_invite'
        | 'mention'
        | 'message'
        | 'reaction'
        | 'system';
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
    | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
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

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      guest_room_end_reason: ['expired', 'closed_by_owner', 'empty', 'moderation'],
      guest_room_message_type: ['text', 'system', 'file', 'image'],
      guest_room_status: ['active', 'expired', 'ended'],
      notification_type: [
        'friend_request',
        'friend_accept',
        'server_invite',
        'channel_invite',
        'mention',
        'message',
        'reaction',
        'system',
      ],
    },
  },
} as const;

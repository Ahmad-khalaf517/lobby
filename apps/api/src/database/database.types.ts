export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
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
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          removed_at: string | null;
          removed_reason: string | null;
          role: Database['public']['Enums']['channel_role'];
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          removed_at?: string | null;
          removed_reason?: string | null;
          role: Database['public']['Enums']['channel_role'];
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          removed_at?: string | null;
          removed_reason?: string | null;
          role?: Database['public']['Enums']['channel_role'];
          updated_at?: string | null;
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
          created_by: string;
          id: string;
          name: string;
          server_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          server_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          server_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'channels_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
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
          user_a_cleared_at: string | null;
          user_a_id: string;
          user_a_last_read_at: string | null;
          user_b_cleared_at: string | null;
          user_b_id: string;
          user_b_last_read_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_a_cleared_at?: string | null;
          user_a_id: string;
          user_a_last_read_at?: string | null;
          user_b_cleared_at?: string | null;
          user_b_id: string;
          user_b_last_read_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_a_cleared_at?: string | null;
          user_a_id?: string;
          user_a_last_read_at?: string | null;
          user_b_cleared_at?: string | null;
          user_b_id?: string;
          user_b_last_read_at?: string | null;
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
          client_message_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          reaction_emoji: string | null;
          reaction_user_id: string | null;
          reply_to: string | null;
          sender_id: string;
        };
        Insert: {
          client_message_id?: string | null;
          content: string;
          conversation_id: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          reaction_emoji?: string | null;
          reaction_user_id?: string | null;
          reply_to?: string | null;
          sender_id: string;
        };
        Update: {
          client_message_id?: string | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          reaction_emoji?: string | null;
          reaction_user_id?: string | null;
          reply_to?: string | null;
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
            foreignKeyName: 'dm_messages_reply_to_fkey';
            columns: ['reply_to'];
            isOneToOne: false;
            referencedRelation: 'dm_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dm_messages_reaction_user_id_fkey';
            columns: ['reaction_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
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
          channel_id: string;
          channel_member_id: string;
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          updated_at: string;
        };
        Insert: {
          channel_id: string;
          channel_member_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          updated_at?: string;
        };
        Update: {
          channel_id?: string;
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
            columns: ['channel_id', 'channel_member_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['channel_id', 'id'];
          },
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
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
          sender_id: string;
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
          sender_id: string;
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
            foreignKeyName: 'messages_reply_to_fkey';
            columns: ['reply_to'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['channel_id', 'sender_id'];
            isOneToOne: false;
            referencedRelation: 'channel_members';
            referencedColumns: ['channel_id', 'id'];
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
          role: Database['public']['Enums']['server_role'];
          server_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          role: Database['public']['Enums']['server_role'];
          server_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          role?: Database['public']['Enums']['server_role'];
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
      clear_dm_conversation: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      create_dm_message: {
        Args: {
          p_client_message_id: string;
          p_content: string;
          p_conversation_id: string;
          p_reply_to?: string;
        };
        Returns: {
          client_message_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          reaction_emoji: string | null;
          reaction_user_id: string | null;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'dm_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_dm_message: {
        Args: { p_conversation_id: string; p_message_id: string };
        Returns: string;
      };
      edit_dm_message: {
        Args: { p_content: string; p_conversation_id: string; p_message_id: string };
        Returns: {
          client_message_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          reaction_emoji: string | null;
          reaction_user_id: string | null;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'dm_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_dm_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      require_dm_participant: {
        Args: { p_conversation_id: string };
        Returns: {
          created_at: string;
          id: string;
          updated_at: string;
          user_a_cleared_at: string | null;
          user_a_id: string;
          user_a_last_read_at: string | null;
          user_b_cleared_at: string | null;
          user_b_id: string;
          user_b_last_read_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'dm_conversations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      toggle_dm_message_reaction: {
        Args: { p_conversation_id: string; p_emoji: string; p_message_id: string };
        Returns: {
          client_message_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          reaction_emoji: string | null;
          reaction_user_id: string | null;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'dm_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_authenticated_channel_message: {
        Args: {
          p_channel_id: string;
          p_client_message_id: string;
          p_content: string;
          p_reply_to?: string;
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
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_authenticated_channel_message: {
        Args: { p_channel_id: string; p_message_id: string };
        Returns: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      edit_authenticated_channel_message: {
        Args: { p_channel_id: string; p_content: string; p_message_id: string };
        Returns: {
          channel_id: string;
          client_message_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_authenticated_channel_member: {
        Args: { target_channel_id: string };
        Returns: boolean;
      };
      join_authenticated_channel_chat: {
        Args: { p_channel_id: string };
        Returns: {
          channel_id: string;
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          removed_at: string | null;
          removed_reason: string | null;
          role: Database['public']['Enums']['channel_role'];
          updated_at: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'channel_members';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      list_authenticated_channel_chat_members: {
        Args: { p_channel_id: string };
        Returns: {
          avatar_url: string;
          channel_member_id: string;
          display_name: string;
          user_id: string;
        }[];
      };
      require_authenticated_channel_member: {
        Args: { p_channel_id: string };
        Returns: {
          channel_id: string;
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          removed_at: string | null;
          removed_reason: string | null;
          role: Database['public']['Enums']['channel_role'];
          updated_at: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'channel_members';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      toggle_authenticated_channel_message_reaction: {
        Args: { p_channel_id: string; p_emoji: string; p_message_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      channel_role: 'owner' | 'member';
      guest_room_end_reason: 'expired' | 'closed_by_owner' | 'empty' | 'moderation';
      guest_room_message_type: 'text' | 'system' | 'file' | 'image';
      guest_room_status: 'active' | 'expired' | 'ended';
      message_type: 'text' | 'system' | 'file' | 'image';
      notification_type:
        | 'friend_request'
        | 'friend_accept'
        | 'server_invite'
        | 'channel_invite'
        | 'mention'
        | 'message'
        | 'reaction'
        | 'system';
      server_role: 'owner' | 'member';
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
  public: {
    Enums: {
      channel_role: ['owner', 'member'],
      guest_room_end_reason: ['expired', 'closed_by_owner', 'empty', 'moderation'],
      guest_room_message_type: ['text', 'system', 'file', 'image'],
      guest_room_status: ['active', 'expired', 'ended'],
      message_type: ['text', 'system', 'file', 'image'],
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
      server_role: ['owner', 'member'],
    },
  },
} as const;

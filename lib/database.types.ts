// Generated from the applied Supabase schema. Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AccountType = "normal" | "admin" | "owner";
type PresenceState = "online" | "away" | "dnd" | "offline";
type ConversationKind = "direct" | "group" | "world";
type ConversationRole = "owner" | "admin" | "member";
type MessageKind = "text" | "image" | "video" | "document" | "voice" | "gif" | "system";
type FriendshipState = "pending" | "accepted" | "declined";
type InviteState = "pending" | "accepted" | "declined" | "revoked";
type NotificationKind = "friend_request" | "friend_accepted" | "mention" | "direct_message" | "group_message" | "group_invite" | "reply" | "reaction" | "announcement";
type ReportState = "open" | "reviewing" | "resolved" | "dismissed";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      conversations: {
        Row: { id: string; kind: ConversationKind; name: string | null; description: string; avatar_path: string | null; owner_id: string | null; created_at: string; updated_at: string; deleted_at: string | null };
        Insert: { id?: string; kind: ConversationKind; name?: string | null; description?: string; avatar_path?: string | null; owner_id?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null };
        Update: { id?: string; kind?: ConversationKind; name?: string | null; description?: string; avatar_path?: string | null; owner_id?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null };
        Relationships: [];
      };
      direct_conversation_pairs: {
        Row: { conversation_id: string; account_low: string; account_high: string };
        Insert: { conversation_id: string; account_low: string; account_high: string };
        Update: { conversation_id?: string; account_low?: string; account_high?: string };
        Relationships: [];
      };
      conversation_members: {
        Row: { conversation_id: string; account_id: string; role: ConversationRole; joined_at: string; last_read_at: string; muted: boolean; notifications: string };
        Insert: { conversation_id: string; account_id: string; role?: ConversationRole; joined_at?: string; last_read_at?: string; muted?: boolean; notifications?: string };
        Update: { conversation_id?: string; account_id?: string; role?: ConversationRole; joined_at?: string; last_read_at?: string; muted?: boolean; notifications?: string };
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; sender_id: string | null; kind: MessageKind; content: string; reply_to_id: string | null; metadata: Json; created_at: string; edited_at: string | null; deleted_at: string | null; search_vector: unknown };
        Insert: { id?: string; conversation_id: string; sender_id?: string | null; kind?: MessageKind; content?: string; reply_to_id?: string | null; metadata?: Json; created_at?: string; edited_at?: string | null; deleted_at?: string | null };
        Update: { content?: string; metadata?: Json; edited_at?: string | null; deleted_at?: string | null };
        Relationships: [];
      };
      message_reactions: {
        Row: { message_id: string; account_id: string; emoji: string; created_at: string };
        Insert: { message_id: string; account_id: string; emoji: string; created_at?: string };
        Update: { emoji?: string };
        Relationships: [];
      };
      message_receipts: {
        Row: { message_id: string; account_id: string; read_at: string };
        Insert: { message_id: string; account_id: string; read_at?: string };
        Update: { read_at?: string };
        Relationships: [];
      };
      pinned_messages: {
        Row: { conversation_id: string; message_id: string; pinned_by: string; pinned_at: string };
        Insert: { conversation_id: string; message_id: string; pinned_by: string; pinned_at?: string };
        Update: { pinned_by?: string; pinned_at?: string };
        Relationships: [];
      };
      message_attachments: {
        Row: { id: string; conversation_id: string; message_id: string | null; uploader_id: string; storage_path: string; file_name: string; mime_type: string; byte_size: number; duration_seconds: number | null; created_at: string };
        Insert: { id?: string; conversation_id: string; message_id?: string | null; uploader_id: string; storage_path: string; file_name: string; mime_type: string; byte_size: number; duration_seconds?: number | null; created_at?: string };
        Update: { message_id?: string | null; duration_seconds?: number | null };
        Relationships: [];
      };
      typing_indicators: {
        Row: { conversation_id: string; account_id: string; expires_at: string };
        Insert: { conversation_id: string; account_id: string; expires_at: string };
        Update: { expires_at?: string };
        Relationships: [];
      };
      friendships: {
        Row: { id: string; requester_id: string; addressee_id: string; state: FriendshipState; created_at: string; responded_at: string | null };
        Insert: { id?: string; requester_id: string; addressee_id: string; state?: FriendshipState; created_at?: string; responded_at?: string | null };
        Update: { state?: FriendshipState; responded_at?: string | null };
        Relationships: [];
      };
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      user_presence: {
        Row: { account_id: string; state: PresenceState; last_seen_at: string; updated_at: string };
        Insert: { account_id: string; state?: PresenceState; last_seen_at?: string; updated_at?: string };
        Update: { state?: PresenceState; last_seen_at?: string; updated_at?: string };
        Relationships: [];
      };
      group_invites: {
        Row: { id: string; conversation_id: string; inviter_id: string; invitee_id: string; state: InviteState; created_at: string; expires_at: string; responded_at: string | null };
        Insert: { id?: string; conversation_id: string; inviter_id: string; invitee_id: string; state?: InviteState; created_at?: string; expires_at?: string; responded_at?: string | null };
        Update: { state?: InviteState; responded_at?: string | null };
        Relationships: [];
      };
      notifications: {
        Row: { id: string; account_id: string; actor_id: string | null; kind: NotificationKind; title: string; body: string; conversation_id: string | null; message_id: string | null; friendship_id: string | null; invite_id: string | null; metadata: Json; created_at: string; read_at: string | null };
        Insert: { id?: string; account_id: string; actor_id?: string | null; kind: NotificationKind; title: string; body?: string; conversation_id?: string | null; message_id?: string | null; friendship_id?: string | null; invite_id?: string | null; metadata?: Json; created_at?: string; read_at?: string | null };
        Update: { body?: string; read_at?: string | null };
        Relationships: [];
      };
      world_chat_settings: {
        Row: { singleton: boolean; slow_mode_seconds: number; profanity_filter: boolean; links_allowed: boolean; updated_at: string; updated_by: string | null };
        Insert: { singleton?: boolean; slow_mode_seconds?: number; profanity_filter?: boolean; links_allowed?: boolean; updated_at?: string; updated_by?: string | null };
        Update: { slow_mode_seconds?: number; profanity_filter?: boolean; links_allowed?: boolean; updated_by?: string | null };
        Relationships: [];
      };
      message_reports: {
        Row: { id: string; reporter_id: string; message_id: string | null; reported_account_id: string | null; reason: string; details: string; state: ReportState; reviewed_by: string | null; created_at: string; reviewed_at: string | null };
        Insert: { id?: string; reporter_id: string; message_id?: string | null; reported_account_id?: string | null; reason: string; details?: string; state?: ReportState; reviewed_by?: string | null; created_at?: string; reviewed_at?: string | null };
        Update: { state?: ReportState; reviewed_by?: string | null; reviewed_at?: string | null };
        Relationships: [];
      };
      moderation_actions: {
        Row: { id: string; moderator_id: string; target_account_id: string | null; message_id: string | null; action: string; reason: string; expires_at: string | null; created_at: string };
        Insert: { id?: string; moderator_id: string; target_account_id?: string | null; message_id?: string | null; action: string; reason?: string; expires_at?: string | null; created_at?: string };
        Update: never;
        Relationships: [];
      };
      accounts: {
        Row: {
          account_type: AccountType;
          created_at: string;
          created_by: string | null;
          disabled: boolean;
          id: string;
          last_login: string | null;
          locked_until: string | null;
          login_attempts: number;
          notes: string | null;
          pin_hash: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          account_type?: AccountType;
          created_at?: string;
          created_by?: string | null;
          disabled?: boolean;
          id?: string;
          last_login?: string | null;
          locked_until?: string | null;
          login_attempts?: number;
          notes?: string | null;
          pin_hash: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          account_type?: AccountType;
          created_at?: string;
          created_by?: string | null;
          disabled?: boolean;
          id?: string;
          last_login?: string | null;
          locked_until?: string | null;
          login_attempts?: number;
          notes?: string | null;
          pin_hash?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [{
          foreignKeyName: "accounts_created_by_fkey";
          columns: ["created_by"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      account_profiles: {
        Row: { account_id: string; avatar_path: string | null; banner_path: string | null; badges: string[]; bio: string; display_name: string; links: Json; privacy: Json; status_text: string; theme: string; updated_at: string };
        Insert: { account_id: string; avatar_path?: string | null; banner_path?: string | null; badges?: string[]; bio?: string; display_name?: string; links?: Json; privacy?: Json; status_text?: string; theme?: string; updated_at?: string };
        Update: { account_id?: string; avatar_path?: string | null; banner_path?: string | null; badges?: string[]; bio?: string; display_name?: string; links?: Json; privacy?: Json; status_text?: string; theme?: string; updated_at?: string };
        Relationships: [{
          foreignKeyName: "account_profiles_account_id_fkey";
          columns: ["account_id"];
          isOneToOne: true;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      activity_logs: {
        Row: { action: string; id: string; ip: string; metadata: Json; timestamp: string; user: string };
        Insert: { action: string; id?: string; ip?: string; metadata?: Json; timestamp?: string; user: string };
        Update: { action?: string; id?: string; ip?: string; metadata?: Json; timestamp?: string; user?: string };
        Relationships: [];
      };
      api_keys: {
        Row: { account_id: string; created_at: string; encrypted_key: string; id: string; key_hint: string; provider: string; updated_at: string };
        Insert: { account_id: string; created_at?: string; encrypted_key: string; id?: string; key_hint: string; provider: string; updated_at?: string };
        Update: { account_id?: string; created_at?: string; encrypted_key?: string; id?: string; key_hint?: string; provider?: string; updated_at?: string };
        Relationships: [{
          foreignKeyName: "api_keys_account_id_fkey";
          columns: ["account_id"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      feature_flags: {
        Row: { description: string; enabled: boolean; key: string; updated_at: string; updated_by: string | null };
        Insert: { description?: string; enabled?: boolean; key: string; updated_at?: string; updated_by?: string | null };
        Update: { description?: string; enabled?: boolean; key?: string; updated_at?: string; updated_by?: string | null };
        Relationships: [{
          foreignKeyName: "feature_flags_updated_by_fkey";
          columns: ["updated_by"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      registration_invites: {
        Row: { account_type: AccountType; code_hash: string; created_at: string; created_by: string | null; disabled: boolean; expires_at: string; id: string; label: string; last_used_at: string | null; max_uses: number; use_count: number };
        Insert: { account_type?: AccountType; code_hash: string; created_at?: string; created_by?: string | null; disabled?: boolean; expires_at: string; id?: string; label?: string; last_used_at?: string | null; max_uses?: number; use_count?: number };
        Update: { account_type?: AccountType; code_hash?: string; created_at?: string; created_by?: string | null; disabled?: boolean; expires_at?: string; id?: string; label?: string; last_used_at?: string | null; max_uses?: number; use_count?: number };
        Relationships: [{
          foreignKeyName: "registration_invites_created_by_fkey";
          columns: ["created_by"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      sessions: {
        Row: { account_id: string; created_at: string; expires_at: string; id: string; ip: string; revoked_at: string | null; token_hash: string; user_agent: string | null };
        Insert: { account_id: string; created_at?: string; expires_at: string; id?: string; ip?: string; revoked_at?: string | null; token_hash: string; user_agent?: string | null };
        Update: { account_id?: string; created_at?: string; expires_at?: string; id?: string; ip?: string; revoked_at?: string | null; token_hash?: string; user_agent?: string | null };
        Relationships: [{
          foreignKeyName: "sessions_account_id_fkey";
          columns: ["account_id"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
      website_settings: {
        Row: { key: string; updated_at: string; updated_by: string | null; value: Json };
        Insert: { key: string; updated_at?: string; updated_by?: string | null; value: Json };
        Update: { key?: string; updated_at?: string; updated_by?: string | null; value?: Json };
        Relationships: [{
          foreignKeyName: "website_settings_updated_by_fkey";
          columns: ["updated_by"];
          isOneToOne: false;
          referencedRelation: "accounts";
          referencedColumns: ["id"];
        }];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_direct_conversation: { Args: { p_actor_session_hash: string; p_username: string }; Returns: string };
      create_group_conversation: { Args: { p_actor_session_hash: string; p_name: string; p_usernames: string[] }; Returns: string };
      send_social_message: { Args: { p_actor_session_hash: string; p_conversation_id: string; p_content: string; p_kind: MessageKind; p_reply_to_id?: string | null }; Returns: string };
      get_social_conversation_stats: { Args: { p_actor_session_hash: string }; Returns: { conversation_id: string; latest_message_id: string | null; latest_content: string | null; latest_kind: MessageKind | null; latest_created_at: string | null; unread_count: number }[] };
      cleanup_expired_sessions: { Args: never; Returns: number };
      clear_rate_limit: { Args: { p_key_hash: string }; Returns: undefined };
      change_own_pin: { Args: { p_actor_session_hash: string; p_ip: string; p_pin_hash: string }; Returns: undefined };
      consume_rate_limit: {
        Args: { p_key_hash: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; retry_after: number }[];
      };
      create_managed_account: {
        Args: { p_account_type: AccountType; p_actor_session_hash: string; p_ip: string; p_notes: string; p_pin_hash: string; p_username: string };
        Returns: string;
      };
      create_account_profile: { Args: never; Returns: unknown };
      create_registration_invite: {
        Args: { p_account_type: AccountType; p_actor_session_hash: string; p_code_hash: string; p_expires_at: string; p_ip: string; p_label: string; p_max_uses: number };
        Returns: string;
      };
      delete_api_key: {
        Args: { p_actor_session_hash: string; p_ip: string; p_provider: string };
        Returns: boolean;
      };
      get_activity_page: {
        Args: { p_actor_session_hash: string; p_before_id: string | null; p_before_timestamp: string | null; p_limit: number };
        Returns: { action: string; id: string; ip: string; timestamp: string; user: string }[];
      };
      get_dashboard_summary: {
        Args: { p_actor_session_hash: string };
        Returns: { active_sessions: number; configured_providers: number; events_today: number; recent_activity: Json }[];
      };
      get_own_profile: {
        Args: { p_actor_session_hash: string };
        Returns: { bio: string; display_name: string; theme: string }[];
      };
      get_own_sessions: {
        Args: { p_actor_session_hash: string };
        Returns: { created_at: string; expires_at: string; id: string; ip: string; is_current: boolean; user_agent: string }[];
      };
      get_registration_invites: {
        Args: { p_actor_session_hash: string };
        Returns: { account_type: AccountType; created_at: string; disabled: boolean; expires_at: string; id: string; label: string; last_used_at: string | null; max_uses: number; use_count: number }[];
      };
      create_session: {
        Args: { p_account_id: string; p_expires_at: string; p_ip: string; p_token_hash: string; p_user_agent: string };
        Returns: undefined;
      };
      get_session_account: {
        Args: { p_token_hash: string };
        Returns: { account_type: AccountType; created_at: string; disabled: boolean; id: string; last_login: string | null; username: string }[];
      };
      record_login_attempt: {
        Args: { p_account_id: string; p_ip: string; p_valid: boolean };
        Returns: { account_type: AccountType | null; created_at: string | null; id: string | null; last_login: string | null; outcome: string; username: string | null }[];
      };
      register_account: {
        Args: { p_invite_hash: string; p_ip: string; p_pin_hash: string; p_username: string };
        Returns: string;
      };
      revoke_other_sessions: { Args: { p_actor_session_hash: string; p_ip: string }; Returns: number };
      revoke_own_session: { Args: { p_actor_session_hash: string; p_ip: string; p_session_id: string }; Returns: boolean };
      revoke_registration_invite: { Args: { p_actor_session_hash: string; p_invite_id: string; p_ip: string }; Returns: boolean };
      revoke_session: { Args: { p_ip: string; p_token_hash: string }; Returns: undefined };
      update_managed_account: {
        Args: { p_account_id: string; p_account_type: AccountType | null; p_action: string; p_actor_session_hash: string; p_ip: string; p_pin_hash: string | null };
        Returns: undefined;
      };
      upsert_api_key: {
        Args: { p_actor_session_hash: string; p_encrypted_key: string; p_ip: string; p_key_hint: string; p_provider: string };
        Returns: undefined;
      };
      update_own_profile: {
        Args: { p_actor_session_hash: string; p_bio: string; p_display_name: string; p_ip: string; p_theme: string };
        Returns: undefined;
      };
    };
    Enums: { account_type: AccountType; conversation_kind: ConversationKind; conversation_role: ConversationRole; friendship_state: FriendshipState; invite_state: InviteState; message_kind: MessageKind; notification_kind: NotificationKind; presence_state: PresenceState; report_state: ReportState };
    CompositeTypes: { [_ in never]: never };
  };
};

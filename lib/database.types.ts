// Generated from the applied Supabase schema. Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AccountType = "normal" | "admin" | "owner";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
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
        Row: { account_id: string; bio: string; display_name: string; theme: string; updated_at: string };
        Insert: { account_id: string; bio?: string; display_name?: string; theme?: string; updated_at?: string };
        Update: { account_id?: string; bio?: string; display_name?: string; theme?: string; updated_at?: string };
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
    Enums: { account_type: AccountType };
    CompositeTypes: { [_ in never]: never };
  };
};

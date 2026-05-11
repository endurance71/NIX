export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          apple_id: string | null;
          push_token: string | null;
          avatar_storage_path: string | null;
          avatar_emoji: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          apple_id?: string | null;
          push_token?: string | null;
          avatar_storage_path?: string | null;
          avatar_emoji?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          apple_id?: string | null;
          push_token?: string | null;
          avatar_storage_path?: string | null;
          avatar_emoji?: string | null;
          created_at?: string;
        };
      };
      nixes: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          media_path: string;
          media_type: string;
          is_viewed: boolean;
          status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
          created_at: string;
          viewed_at: string | null;
          cleaned_at: string | null;
          view_duration_sec: number;
          playback_duration_ms: number | null;
          client_upload_id: string | null;
          thumbnail_b64: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          media_path: string;
          media_type?: string;
          is_viewed?: boolean;
          status?: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
          created_at?: string;
          viewed_at?: string | null;
          cleaned_at?: string | null;
          view_duration_sec?: number;
          playback_duration_ms?: number | null;
          client_upload_id?: string | null;
          thumbnail_b64?: string | null;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          media_path?: string;
          media_type?: string;
          is_viewed?: boolean;
          status?: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
          created_at?: string;
          viewed_at?: string | null;
          cleaned_at?: string | null;
          view_duration_sec?: number;
          playback_duration_ms?: number | null;
          client_upload_id?: string | null;
          thumbnail_b64?: string | null;
        };
      };
      nix_cleanup_queue: {
        Row: {
          nix_id: string;
          receiver_id: string;
          media_path: string;
          attempt_count: number | null;
          next_attempt_at: string | null;
          last_error: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          nix_id: string;
          receiver_id: string;
          media_path: string;
          attempt_count?: number | null;
          next_attempt_at?: string | null;
          last_error?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          nix_id?: string;
          receiver_id?: string;
          media_path?: string;
          attempt_count?: number | null;
          next_attempt_at?: string | null;
          last_error?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      nix_cleanup_audit: {
        Row: {
          id: string;
          nix_id: string | null;
          receiver_id: string | null;
          media_path: string | null;
          status: string;
          error_message: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          nix_id?: string | null;
          receiver_id?: string | null;
          media_path?: string | null;
          status: string;
          error_message?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          nix_id?: string | null;
          receiver_id?: string | null;
          media_path?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string | null;
        };
      };
      nix_capture_prefs: {
        Row: {
          owner_user_id: string;
          friend_user_id: string;
          capture_policy: string;
          updated_at: string | null;
        };
        Insert: {
          owner_user_id: string;
          friend_user_id: string;
          capture_policy?: string;
          updated_at?: string | null;
        };
        Update: {
          owner_user_id?: string;
          friend_user_id?: string;
          capture_policy?: string;
          updated_at?: string | null;
        };
      };
      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          status: 'pending' | 'accepted';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          status?: 'pending' | 'accepted';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_id?: string;
          status?: 'pending' | 'accepted';
          created_at?: string;
        };
      };
      friend_invites: {
        Row: {
          id: string;
          created_by: string;
          token_hash: string;
          channel: 'qr';
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          token_hash: string;
          channel: 'qr';
          expires_at: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          token_hash?: string;
          channel?: 'qr';
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Nix = Database['public']['Tables']['nixes']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type FriendInvite = Database['public']['Tables']['friend_invites']['Row'];
export type NixCleanupQueue = Database['public']['Tables']['nix_cleanup_queue']['Row'];
export type NixCleanupAudit = Database['public']['Tables']['nix_cleanup_audit']['Row'];
export type NixCapturePref = Database['public']['Tables']['nix_capture_prefs']['Row'];

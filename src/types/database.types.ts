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
      snaps: {
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
export type Snap = Database['public']['Tables']['snaps']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type FriendInvite = Database['public']['Tables']['friend_invites']['Row'];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export const MESSAGE_REACTION_EMOJIS = [
  'heart',
  'thumbsup',
  'thumbsdown',
  'hahaha',
  'exclamation',
  'question',
] as const;

export type MessageReactionEmoji = (typeof MESSAGE_REACTION_EMOJIS)[number];

export interface Database {
  public: {
    Tables: {
      age_attestations: {
        Row: { user_id: string; minimum_age: 16; policy_version: string; attested_at: string };
        Insert: { user_id: string; minimum_age?: 16; policy_version: string; attested_at?: string };
        Update: { user_id?: string; minimum_age?: 16; policy_version?: string; attested_at?: string };
      };
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string; created_at?: string };
        Update: { blocker_id?: string; blocked_id?: string; created_at?: string };
      };
      content_reports: {
        Row: {
          id: string;
          reporter_id: string | null;
          reported_user_id: string | null;
          nix_id: string | null;
          reason: string;
          details: string | null;
          status: string;
          priority: 'critical' | 'normal';
          evidence_path: string | null;
          evidence_expires_at: string | null;
          evidence_deleted_at: string | null;
          created_at: string;
          acknowledged_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id?: string | null;
          reported_user_id?: string | null;
          nix_id?: string | null;
          reason: string;
          details?: string | null;
          status?: string;
          priority?: 'critical' | 'normal';
          evidence_path?: string | null;
          evidence_expires_at?: string | null;
          evidence_deleted_at?: string | null;
          created_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string | null;
          reported_user_id?: string | null;
          nix_id?: string | null;
          reason?: string;
          details?: string | null;
          status?: string;
          priority?: 'critical' | 'normal';
          evidence_path?: string | null;
          evidence_expires_at?: string | null;
          evidence_deleted_at?: string | null;
          created_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          is_private: boolean;
          apple_id: string | null;
          avatar_storage_path: string | null;
          avatar_emoji: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          is_private?: boolean;
          apple_id?: string | null;
          avatar_storage_path?: string | null;
          avatar_emoji?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          is_private?: boolean;
          apple_id?: string | null;
          avatar_storage_path?: string | null;
          avatar_emoji?: string | null;
          created_at?: string;
        };
      };
      push_devices: {
        Row: {
          id: string;
          installation_id: string;
          user_id: string;
          expo_push_token: string;
          native_push_token: string | null;
          platform: 'ios' | 'android';
          locale: 'pl' | 'en';
          app_version: string | null;
          enabled: boolean;
          disabled_reason: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          installation_id: string;
          user_id: string;
          expo_push_token: string;
          native_push_token?: string | null;
          platform: 'ios' | 'android';
          locale?: 'pl' | 'en';
          app_version?: string | null;
          enabled?: boolean;
          disabled_reason?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_devices']['Insert']>;
      };
      push_notification_jobs: {
        Row: {
          id: string;
          event_type: 'new_nix' | 'friend_request' | 'friend_accepted';
          event_key: string;
          recipient_id: string;
          actor_id: string;
          entity_id: string;
          status: 'pending' | 'processing' | 'dispatched' | 'skipped' | 'failed';
          attempts: number;
          next_attempt_at: string;
          locked_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['push_notification_jobs']['Row'], 'id' | 'status' | 'attempts' | 'next_attempt_at' | 'locked_at' | 'last_error' | 'created_at' | 'updated_at'> & {
          id?: string;
          status?: Database['public']['Tables']['push_notification_jobs']['Row']['status'];
          attempts?: number;
          next_attempt_at?: string;
          locked_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_notification_jobs']['Insert']>;
      };
      push_notification_deliveries: {
        Row: {
          id: string;
          job_id: string;
          device_id: string;
          expo_ticket_id: string | null;
          status: 'ticketed' | 'delivered' | 'failed';
          error_code: string | null;
          ticket_received_at: string | null;
          next_receipt_check_at: string | null;
          receipt_checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['push_notification_deliveries']['Row'], 'id' | 'expo_ticket_id' | 'error_code' | 'ticket_received_at' | 'next_receipt_check_at' | 'receipt_checked_at' | 'created_at' | 'updated_at'> & {
          id?: string;
          expo_ticket_id?: string | null;
          error_code?: string | null;
          ticket_received_at?: string | null;
          next_receipt_check_at?: string | null;
          receipt_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_notification_deliveries']['Insert']>;
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
          previewed_by: string | null;
          previewed_at: string | null;
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
          previewed_by?: string | null;
          previewed_at?: string | null;
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
          previewed_by?: string | null;
          previewed_at?: string | null;
          created_at?: string;
        };
      };
      text_messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string;
          expires_at: string;
          client_message_id: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at?: string;
          expires_at?: string;
          client_message_id?: string | null;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          body?: string;
          created_at?: string;
          expires_at?: string;
          client_message_id?: string | null;
        };
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: MessageReactionEmoji;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: MessageReactionEmoji;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          emoji?: MessageReactionEmoji;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Nix = Database['public']['Tables']['nixes']['Row'];
export type TextMessage = Database['public']['Tables']['text_messages']['Row'];
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type FriendInvite = Database['public']['Tables']['friend_invites']['Row'];
export type NixCleanupQueue = Database['public']['Tables']['nix_cleanup_queue']['Row'];
export type NixCleanupAudit = Database['public']['Tables']['nix_cleanup_audit']['Row'];
export type NixCapturePref = Database['public']['Tables']['nix_capture_prefs']['Row'];
export type AgeAttestation = Database['public']['Tables']['age_attestations']['Row'];
export type UserBlock = Database['public']['Tables']['user_blocks']['Row'];
export type ContentReport = Database['public']['Tables']['content_reports']['Row'];
export type PushDevice = Database['public']['Tables']['push_devices']['Row'];
export type PushNotificationJob = Database['public']['Tables']['push_notification_jobs']['Row'];
export type PushNotificationDelivery = Database['public']['Tables']['push_notification_deliveries']['Row'];

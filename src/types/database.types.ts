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
      conversation_read_states: {
        Row: { user_id: string; peer_id: string; last_read_at: string; updated_at: string };
        Insert: { user_id: string; peer_id: string; last_read_at?: string; updated_at?: string };
        Update: { last_read_at?: string; updated_at?: string };
      };
      product_analytics_preferences: {
        Row: { user_id: string; enabled: boolean; policy_version: string; updated_at: string };
        Insert: { user_id: string; enabled?: boolean; policy_version?: string; updated_at?: string };
        Update: { enabled?: boolean; policy_version?: string; updated_at?: string };
      };
      product_analytics_events: {
        Row: {
          id: number;
          installation_id: string;
          event_name: ProductAnalyticsEventName;
          app_version: string | null;
          locale: 'pl' | 'en';
          properties: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['product_analytics_events']['Row'], 'id' | 'created_at'> & {
          id?: number;
          created_at?: string;
        };
        Update: never;
      };
      product_analytics_daily: {
        Row: { event_date: string; event_name: string; locale: 'pl' | 'en'; event_count: number };
        Insert: { event_date: string; event_name: string; locale: 'pl' | 'en'; event_count: number };
        Update: { event_count?: number };
      };
      user_activation_state: {
        Row: {
          user_id: string;
          skipped_at: string | null;
          dismissed_at: string | null;
          completed_at: string | null;
          last_shown_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          skipped_at?: string | null;
          dismissed_at?: string | null;
          completed_at?: string | null;
          last_shown_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_activation_state']['Insert']>;
      };
      notification_preferences: {
        Row: {
          user_id: string;
          messages_enabled: boolean;
          reactions_enabled: boolean;
          friends_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          messages_enabled?: boolean;
          reactions_enabled?: boolean;
          friends_enabled?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };
      conversation_mutes: {
        Row: {
          owner_user_id: string;
          peer_user_id: string;
          muted_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_user_id: string;
          peer_user_id: string;
          muted_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { muted_until?: string | null; updated_at?: string };
      };
      app_installations: {
        Row: {
          installation_id: string;
          user_id: string;
          device_name: string;
          system_version: string | null;
          app_version: string | null;
          locale: 'pl' | 'en';
          last_seen_at: string;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          installation_id: string;
          user_id: string;
          device_name: string;
          system_version?: string | null;
          app_version?: string | null;
          locale: 'pl' | 'en';
          last_seen_at?: string;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['app_installations']['Insert']>;
      };
      data_export_jobs: {
        Row: {
          id: string;
          user_id: string;
          status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
          storage_path: string | null;
          archive_size_bytes: number | null;
          manifest_sha256: string | null;
          error_code: string | null;
          requested_at: string;
          started_at: string | null;
          completed_at: string | null;
          expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: Database['public']['Tables']['data_export_jobs']['Row']['status'];
          storage_path?: string | null;
          archive_size_bytes?: number | null;
          manifest_sha256?: string | null;
          error_code?: string | null;
          requested_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['data_export_jobs']['Insert']>;
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
          is_replayed: boolean;
          replay_expires_at: string | null;
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
          is_replayed?: boolean;
          replay_expires_at?: string | null;
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
          is_replayed?: boolean;
          replay_expires_at?: string | null;
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
          channel: 'qr' | 'share';
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
          channel: 'qr' | 'share';
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
          channel?: 'qr' | 'share';
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
          is_system: boolean;
          metadata: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at?: string;
          expires_at?: string;
          client_message_id?: string | null;
          is_system?: boolean;
          metadata?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          body?: string;
          created_at?: string;
          expires_at?: string;
          client_message_id?: string | null;
          is_system?: boolean;
          metadata?: Record<string, unknown> | null;
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
    Functions: {
      get_unread_inbox_count: { Args: Record<string, never>; Returns: number };
      mark_text_conversation_read: {
        Args: { peer_id: string; read_through: string };
        Returns: string;
      };
      set_product_analytics_consent: { Args: { p_enabled: boolean }; Returns: void };
      record_product_analytics_event: {
        Args: {
          p_installation_id: string;
          p_event_name: ProductAnalyticsEventName;
          p_app_version: string | null;
          p_locale: 'pl' | 'en';
          p_properties?: Json;
        };
        Returns: boolean;
      };
      get_user_activation_state: {
        Args: Record<string, never>;
        Returns: ActivationState[];
      };
      update_user_activation_state: {
        Args: { p_action: 'shown' | 'skip' | 'dismiss' };
        Returns: void;
      };
      set_notification_preferences: {
        Args: {
          p_messages_enabled: boolean;
          p_reactions_enabled: boolean;
          p_friends_enabled: boolean;
        };
        Returns: Database['public']['Tables']['notification_preferences']['Row'];
      };
      set_conversation_mute: {
        Args: { p_peer_id: string; p_muted_until: string | null; p_indefinite?: boolean };
        Returns: void;
      };
      register_app_installation: {
        Args: {
          p_installation_id: string;
          p_device_name: string;
          p_system_version: string | null;
          p_app_version: string | null;
          p_locale: 'pl' | 'en';
        };
        Returns: void;
      };
      revoke_other_app_installations: {
        Args: { p_current_installation_id: string };
        Returns: number;
      };
      request_data_export: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['data_export_jobs']['Row'];
      };
      mark_nix_viewed_for_replay: {
        Args: { p_nix_id: string };
        Returns: void;
      };
      mark_nix_replayed: {
        Args: { p_nix_id: string };
        Returns: void;
      };
    };
  };
}

export type ProductAnalyticsEventName =
  | 'onboarding_completed'
  | 'inbox_search_used'
  | 'invite_shared'
  | 'invite_opened'
  | 'invite_redeemed'
  | 'first_friend_accepted'
  | 'first_nix_sent'
  | 'nix_opened'
  | 'text_outbox_retry'
  | 'push_preference_changed'
  | 'data_export_requested';

export type ActivationState = {
  has_friend: boolean;
  has_sent_nix: boolean;
  skipped_at: string | null;
  dismissed_at: string | null;
  completed_at: string | null;
  last_shown_at: string | null;
};

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
export type NotificationPreferences = Database['public']['Tables']['notification_preferences']['Row'];
export type ConversationMute = Database['public']['Tables']['conversation_mutes']['Row'];
export type AppInstallation = Database['public']['Tables']['app_installations']['Row'];
export type DataExportJob = Database['public']['Tables']['data_export_jobs']['Row'];

// Database wire types are generated from the migrated SQL catalog.
// DomainRows are UI view models, including CHECK-constrained text values.
import type { Json } from './database.generated';
export type { Database, Json } from './database.generated';
export const MESSAGE_REACTION_EMOJIS = [
    'heart',
    'thumbsup',
    'thumbsdown',
    'hahaha',
    'exclamation',
    'question',
] as const;
export type MessageReactionEmoji = (typeof MESSAGE_REACTION_EMOJIS)[number];
type DomainRows = {
    age_attestations: {
        user_id: string;
        minimum_age: 16;
        policy_version: string;
        attested_at: string;
    };
    user_blocks: {
        blocker_id: string;
        blocked_id: string;
        created_at: string;
    };
    content_reports: {
        id: string;
        reporter_id: string | null;
        reported_user_id: string | null;
        nix_id: string | null;
        text_message_id: string | null;
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
    profiles: {
        id: string;
        username: string | null;
        display_name: string | null;
        bio: string | null;
        is_private: boolean;
        apple_id: string | null;
        avatar_storage_path: string | null;
        avatar_emoji: string | null;
        created_at: string;
    };
    push_devices: {
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
    conversation_read_states: {
        user_id: string;
        peer_id: string;
        last_read_at: string;
        updated_at: string;
    };
    product_analytics_preferences: {
        user_id: string;
        enabled: boolean;
        policy_version: string;
        updated_at: string;
    };
    product_analytics_events: {
        id: number;
        installation_id: string;
        event_name: ProductAnalyticsEventName;
        app_version: string | null;
        locale: 'pl' | 'en';
        properties: Json;
        created_at: string;
    };
    product_analytics_daily: {
        event_date: string;
        event_name: string;
        locale: 'pl' | 'en';
        event_count: number;
    };
    user_activation_state: {
        user_id: string;
        skipped_at: string | null;
        dismissed_at: string | null;
        completed_at: string | null;
        last_shown_at: string | null;
        updated_at: string;
    };
    notification_preferences: {
        user_id: string;
        messages_enabled: boolean;
        reactions_enabled: boolean;
        friends_enabled: boolean;
        updated_at: string;
    };
    conversation_mutes: {
        owner_user_id: string;
        peer_user_id: string;
        muted_until: string | null;
        created_at: string;
        updated_at: string;
    };
    app_installations: {
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
    data_export_jobs: {
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
    push_notification_jobs: {
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
    push_notification_deliveries: {
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
    nixes: {
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
    nix_cleanup_queue: {
        nix_id: string;
        receiver_id: string;
        media_path: string;
        attempt_count: number | null;
        next_attempt_at: string | null;
        last_error: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    nix_cleanup_audit: {
        id: string;
        nix_id: string | null;
        receiver_id: string | null;
        media_path: string | null;
        status: string;
        error_message: string | null;
        created_at: string | null;
    };
    nix_capture_prefs: {
        owner_user_id: string;
        friend_user_id: string;
        capture_policy: string;
        updated_at: string | null;
    };
    friendships: {
        id: string;
        user_id: string;
        friend_id: string;
        status: 'pending' | 'accepted';
        created_at: string;
    };
    friend_invites: {
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
    text_messages: {
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
    message_reactions: {
        id: string;
        message_id: string;
        user_id: string;
        emoji: MessageReactionEmoji;
        created_at: string;
        updated_at: string;
    };
};
export type ProductAnalyticsEventName = 'onboarding_completed' | 'inbox_search_used' | 'invite_shared' | 'invite_opened' | 'invite_redeemed' | 'first_friend_accepted' | 'first_nix_sent' | 'nix_opened' | 'text_outbox_retry' | 'push_preference_changed' | 'data_export_requested';
export type ActivationState = {
    has_friend: boolean;
    has_sent_nix: boolean;
    skipped_at: string | null;
    dismissed_at: string | null;
    completed_at: string | null;
    last_shown_at: string | null;
};
export type Profile = DomainRows['profiles'];
export type Nix = DomainRows['nixes'];
export type TextMessage = DomainRows['text_messages'];
export type MessageReaction = DomainRows['message_reactions'];
export type Friendship = DomainRows['friendships'];
export type FriendInvite = DomainRows['friend_invites'];
export type NixCleanupQueue = DomainRows['nix_cleanup_queue'];
export type NixCleanupAudit = DomainRows['nix_cleanup_audit'];
export type NixCapturePref = DomainRows['nix_capture_prefs'];
export type AgeAttestation = DomainRows['age_attestations'];
export type UserBlock = DomainRows['user_blocks'];
export type ContentReport = DomainRows['content_reports'];
export type PushDevice = DomainRows['push_devices'];
export type PushNotificationJob = DomainRows['push_notification_jobs'];
export type PushNotificationDelivery = DomainRows['push_notification_deliveries'];
export type NotificationPreferences = DomainRows['notification_preferences'];
export type ConversationMute = DomainRows['conversation_mutes'];
export type AppInstallation = DomainRows['app_installations'];
export type DataExportJob = DomainRows['data_export_jobs'];

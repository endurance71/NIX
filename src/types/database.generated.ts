// Generated from the migrated PostgreSQL public catalog. Do not edit.
// Regenerate: NIX_TYPES_DB_URL=<local DSN> npm run gen:database
export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export type Database = {
    public: {
        Tables: {
            "age_attestations": {
                Row: {
                    "user_id": string;
                    "minimum_age": number;
                    "policy_version": string;
                    "attested_at": string;
                };
                Insert: {
                    "user_id": string;
                    "minimum_age"?: number;
                    "policy_version": string;
                    "attested_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "minimum_age"?: number;
                    "policy_version"?: string;
                    "attested_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "age_attestations_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "app_installations": {
                Row: {
                    "installation_id": string;
                    "user_id": string;
                    "device_name": string;
                    "system_version": string | null;
                    "app_version": string | null;
                    "locale": string;
                    "last_seen_at": string;
                    "revoked_at": string | null;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "installation_id": string;
                    "user_id": string;
                    "device_name": string;
                    "system_version"?: string | null;
                    "app_version"?: string | null;
                    "locale": string;
                    "last_seen_at"?: string;
                    "revoked_at"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "installation_id"?: string;
                    "user_id"?: string;
                    "device_name"?: string;
                    "system_version"?: string | null;
                    "app_version"?: string | null;
                    "locale"?: string;
                    "last_seen_at"?: string;
                    "revoked_at"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "app_installations_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "content_reports": {
                Row: {
                    "id": string;
                    "reporter_id": string | null;
                    "reported_user_id": string | null;
                    "nix_id": string | null;
                    "reason": string;
                    "details": string | null;
                    "status": string;
                    "priority": string;
                    "evidence_path": string | null;
                    "evidence_expires_at": string | null;
                    "evidence_deleted_at": string | null;
                    "created_at": string;
                    "acknowledged_at": string | null;
                    "resolved_at": string | null;
                    "text_message_id": string | null;
                };
                Insert: {
                    "id"?: string;
                    "reporter_id"?: string | null;
                    "reported_user_id"?: string | null;
                    "nix_id"?: string | null;
                    "reason": string;
                    "details"?: string | null;
                    "status"?: string;
                    "priority"?: string;
                    "evidence_path"?: string | null;
                    "evidence_expires_at"?: string | null;
                    "evidence_deleted_at"?: string | null;
                    "created_at"?: string;
                    "acknowledged_at"?: string | null;
                    "resolved_at"?: string | null;
                    "text_message_id"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "reporter_id"?: string | null;
                    "reported_user_id"?: string | null;
                    "nix_id"?: string | null;
                    "reason"?: string;
                    "details"?: string | null;
                    "status"?: string;
                    "priority"?: string;
                    "evidence_path"?: string | null;
                    "evidence_expires_at"?: string | null;
                    "evidence_deleted_at"?: string | null;
                    "created_at"?: string;
                    "acknowledged_at"?: string | null;
                    "resolved_at"?: string | null;
                    "text_message_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "content_reports_reporter_id_fkey";
                        columns: [
                            "reporter_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "content_reports_reported_user_id_fkey";
                        columns: [
                            "reported_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "content_reports_nix_id_fkey";
                        columns: [
                            "nix_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "nixes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "content_reports_text_message_id_fkey";
                        columns: [
                            "text_message_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "text_messages";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "conversation_mutes": {
                Row: {
                    "owner_user_id": string;
                    "peer_user_id": string;
                    "muted_until": string | null;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "owner_user_id": string;
                    "peer_user_id": string;
                    "muted_until"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "owner_user_id"?: string;
                    "peer_user_id"?: string;
                    "muted_until"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "conversation_mutes_owner_user_id_fkey";
                        columns: [
                            "owner_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "conversation_mutes_peer_user_id_fkey";
                        columns: [
                            "peer_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "conversation_read_states": {
                Row: {
                    "user_id": string;
                    "peer_id": string;
                    "last_read_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "user_id": string;
                    "peer_id": string;
                    "last_read_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "peer_id"?: string;
                    "last_read_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "conversation_read_states_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "conversation_read_states_peer_id_fkey";
                        columns: [
                            "peer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "data_export_jobs": {
                Row: {
                    "id": string;
                    "user_id": string;
                    "status": string;
                    "storage_path": string | null;
                    "archive_size_bytes": number | null;
                    "manifest_sha256": string | null;
                    "error_code": string | null;
                    "requested_at": string;
                    "started_at": string | null;
                    "completed_at": string | null;
                    "expires_at": string | null;
                    "updated_at": string;
                };
                Insert: {
                    "id"?: string;
                    "user_id": string;
                    "status"?: string;
                    "storage_path"?: string | null;
                    "archive_size_bytes"?: number | null;
                    "manifest_sha256"?: string | null;
                    "error_code"?: string | null;
                    "requested_at"?: string;
                    "started_at"?: string | null;
                    "completed_at"?: string | null;
                    "expires_at"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "user_id"?: string;
                    "status"?: string;
                    "storage_path"?: string | null;
                    "archive_size_bytes"?: number | null;
                    "manifest_sha256"?: string | null;
                    "error_code"?: string | null;
                    "requested_at"?: string;
                    "started_at"?: string | null;
                    "completed_at"?: string | null;
                    "expires_at"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "data_export_jobs_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "friend_invites": {
                Row: {
                    "id": string;
                    "created_by": string;
                    "token_hash": string;
                    "channel": string;
                    "expires_at": string;
                    "used_at": string | null;
                    "used_by": string | null;
                    "created_at": string | null;
                    "previewed_by": string | null;
                    "previewed_at": string | null;
                };
                Insert: {
                    "id"?: string;
                    "created_by": string;
                    "token_hash": string;
                    "channel": string;
                    "expires_at": string;
                    "used_at"?: string | null;
                    "used_by"?: string | null;
                    "created_at"?: string | null;
                    "previewed_by"?: string | null;
                    "previewed_at"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "created_by"?: string;
                    "token_hash"?: string;
                    "channel"?: string;
                    "expires_at"?: string;
                    "used_at"?: string | null;
                    "used_by"?: string | null;
                    "created_at"?: string | null;
                    "previewed_by"?: string | null;
                    "previewed_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "friend_invites_created_by_fkey";
                        columns: [
                            "created_by"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "friend_invites_previewed_by_fkey";
                        columns: [
                            "previewed_by"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "friend_invites_used_by_fkey";
                        columns: [
                            "used_by"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "friendships": {
                Row: {
                    "id": string;
                    "user_id": string;
                    "friend_id": string;
                    "status": string | null;
                    "created_at": string | null;
                };
                Insert: {
                    "id"?: string;
                    "user_id": string;
                    "friend_id": string;
                    "status"?: string | null;
                    "created_at"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "user_id"?: string;
                    "friend_id"?: string;
                    "status"?: string | null;
                    "created_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "friendships_friend_id_fkey";
                        columns: [
                            "friend_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "friendships_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "legal_acceptances": {
                Row: {
                    "user_id": string;
                    "terms_version": string;
                    "privacy_version": string;
                    "accepted_at": string;
                };
                Insert: {
                    "user_id": string;
                    "terms_version": string;
                    "privacy_version": string;
                    "accepted_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "terms_version"?: string;
                    "privacy_version"?: string;
                    "accepted_at"?: string;
                };
                Relationships: [
                ];
            };
            "media_assets": {
                Row: {
                    "id": string;
                    "owner_id": string;
                    "storage_path": string;
                    "media_type": string;
                    "content_type": string;
                    "size_bytes": number;
                    "playback_duration_ms": number | null;
                    "thumbnail_b64": string | null;
                    "status": string;
                    "created_at": string;
                    "ready_at": string | null;
                    "deleted_at": string | null;
                    "expires_at": string;
                    "upload_batch_id": string | null;
                };
                Insert: {
                    "id"?: string;
                    "owner_id": string;
                    "storage_path": string;
                    "media_type": string;
                    "content_type": string;
                    "size_bytes": number;
                    "playback_duration_ms"?: number | null;
                    "thumbnail_b64"?: string | null;
                    "status"?: string;
                    "created_at"?: string;
                    "ready_at"?: string | null;
                    "deleted_at"?: string | null;
                    "expires_at"?: string;
                    "upload_batch_id"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "owner_id"?: string;
                    "storage_path"?: string;
                    "media_type"?: string;
                    "content_type"?: string;
                    "size_bytes"?: number;
                    "playback_duration_ms"?: number | null;
                    "thumbnail_b64"?: string | null;
                    "status"?: string;
                    "created_at"?: string;
                    "ready_at"?: string | null;
                    "deleted_at"?: string | null;
                    "expires_at"?: string;
                    "upload_batch_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "media_assets_owner_id_fkey";
                        columns: [
                            "owner_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "media_assets_upload_batch_id_fkey";
                        columns: [
                            "upload_batch_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "media_upload_batches";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "media_upload_batches": {
                Row: {
                    "id": string;
                    "sender_id": string;
                    "asset_id": string;
                    "idempotency_key": string;
                    "finalize_token_hash": string;
                    "status": string;
                    "created_at": string;
                    "updated_at": string;
                    "finalized_at": string | null;
                    "expires_at": string;
                };
                Insert: {
                    "id"?: string;
                    "sender_id": string;
                    "asset_id": string;
                    "idempotency_key": string;
                    "finalize_token_hash": string;
                    "status"?: string;
                    "created_at"?: string;
                    "updated_at"?: string;
                    "finalized_at"?: string | null;
                    "expires_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "sender_id"?: string;
                    "asset_id"?: string;
                    "idempotency_key"?: string;
                    "finalize_token_hash"?: string;
                    "status"?: string;
                    "created_at"?: string;
                    "updated_at"?: string;
                    "finalized_at"?: string | null;
                    "expires_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "media_upload_batches_sender_id_fkey";
                        columns: [
                            "sender_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "media_upload_batches_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "media_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "media_upload_recipients": {
                Row: {
                    "batch_id": string;
                    "receiver_id": string;
                    "view_duration_sec": number;
                    "sequence_index": number;
                    "status": string;
                    "error_code": string | null;
                    "nix_id": string | null;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "batch_id": string;
                    "receiver_id": string;
                    "view_duration_sec"?: number;
                    "sequence_index"?: number;
                    "status"?: string;
                    "error_code"?: string | null;
                    "nix_id"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "batch_id"?: string;
                    "receiver_id"?: string;
                    "view_duration_sec"?: number;
                    "sequence_index"?: number;
                    "status"?: string;
                    "error_code"?: string | null;
                    "nix_id"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "media_upload_recipients_batch_id_fkey";
                        columns: [
                            "batch_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "media_upload_batches";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "media_upload_recipients_receiver_id_fkey";
                        columns: [
                            "receiver_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "media_upload_recipients_nix_id_fkey";
                        columns: [
                            "nix_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "nixes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "message_reactions": {
                Row: {
                    "id": string;
                    "message_id": string;
                    "user_id": string;
                    "emoji": string;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "id"?: string;
                    "message_id": string;
                    "user_id": string;
                    "emoji": string;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "message_id"?: string;
                    "user_id"?: string;
                    "emoji"?: string;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "message_reactions_message_id_fkey";
                        columns: [
                            "message_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "text_messages";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "message_reactions_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "moderation_jobs": {
                Row: {
                    "id": string;
                    "content_kind": Database['public']['Enums']["moderation_content_kind"];
                    "batch_id": string | null;
                    "asset_id": string | null;
                    "text_payload_id": string | null;
                    "sender_id": string;
                    "receiver_id": string | null;
                    "client_message_id": string | null;
                    "status": Database['public']['Enums']["moderation_job_status"];
                    "decision": string | null;
                    "policy_version": string | null;
                    "max_severity": number | null;
                    "provider_operation_id": string | null;
                    "attempt_count": number;
                    "lease_owner": string | null;
                    "lease_expires_at": string | null;
                    "next_attempt_at": string;
                    "last_error": string | null;
                    "created_at": string;
                    "updated_at": string;
                    "completed_at": string | null;
                    "waiting_reason": string | null;
                    "materialized_at": string | null;
                };
                Insert: {
                    "id"?: string;
                    "content_kind": Database['public']['Enums']["moderation_content_kind"];
                    "batch_id"?: string | null;
                    "asset_id"?: string | null;
                    "text_payload_id"?: string | null;
                    "sender_id": string;
                    "receiver_id"?: string | null;
                    "client_message_id"?: string | null;
                    "status"?: Database['public']['Enums']["moderation_job_status"];
                    "decision"?: string | null;
                    "policy_version"?: string | null;
                    "max_severity"?: number | null;
                    "provider_operation_id"?: string | null;
                    "attempt_count"?: number;
                    "lease_owner"?: string | null;
                    "lease_expires_at"?: string | null;
                    "next_attempt_at"?: string;
                    "last_error"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                    "completed_at"?: string | null;
                    "waiting_reason"?: string | null;
                    "materialized_at"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "content_kind"?: Database['public']['Enums']["moderation_content_kind"];
                    "batch_id"?: string | null;
                    "asset_id"?: string | null;
                    "text_payload_id"?: string | null;
                    "sender_id"?: string;
                    "receiver_id"?: string | null;
                    "client_message_id"?: string | null;
                    "status"?: Database['public']['Enums']["moderation_job_status"];
                    "decision"?: string | null;
                    "policy_version"?: string | null;
                    "max_severity"?: number | null;
                    "provider_operation_id"?: string | null;
                    "attempt_count"?: number;
                    "lease_owner"?: string | null;
                    "lease_expires_at"?: string | null;
                    "next_attempt_at"?: string;
                    "last_error"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                    "completed_at"?: string | null;
                    "waiting_reason"?: string | null;
                    "materialized_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "moderation_jobs_batch_id_fkey";
                        columns: [
                            "batch_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "media_upload_batches";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "moderation_jobs_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "media_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "moderation_jobs_text_payload_id_fkey";
                        columns: [
                            "text_payload_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "moderation_text_payloads";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "moderation_text_payloads": {
                Row: {
                    "id": string;
                    "body": string;
                    "created_at": string;
                    "expires_at": string;
                };
                Insert: {
                    "id"?: string;
                    "body": string;
                    "created_at"?: string;
                    "expires_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "body"?: string;
                    "created_at"?: string;
                    "expires_at"?: string;
                };
                Relationships: [
                ];
            };
            "nix_capture_prefs": {
                Row: {
                    "owner_user_id": string;
                    "friend_user_id": string;
                    "capture_policy": string;
                    "updated_at": string | null;
                };
                Insert: {
                    "owner_user_id": string;
                    "friend_user_id": string;
                    "capture_policy"?: string;
                    "updated_at"?: string | null;
                };
                Update: {
                    "owner_user_id"?: string;
                    "friend_user_id"?: string;
                    "capture_policy"?: string;
                    "updated_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "snap_capture_prefs_friend_user_id_fkey";
                        columns: [
                            "friend_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "snap_capture_prefs_owner_user_id_fkey";
                        columns: [
                            "owner_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "nix_cleanup_audit": {
                Row: {
                    "id": string;
                    "nix_id": string | null;
                    "receiver_id": string | null;
                    "media_path": string | null;
                    "status": string;
                    "error_message": string | null;
                    "created_at": string | null;
                };
                Insert: {
                    "id"?: string;
                    "nix_id"?: string | null;
                    "receiver_id"?: string | null;
                    "media_path"?: string | null;
                    "status": string;
                    "error_message"?: string | null;
                    "created_at"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "nix_id"?: string | null;
                    "receiver_id"?: string | null;
                    "media_path"?: string | null;
                    "status"?: string;
                    "error_message"?: string | null;
                    "created_at"?: string | null;
                };
                Relationships: [
                ];
            };
            "nix_cleanup_queue": {
                Row: {
                    "nix_id": string;
                    "receiver_id": string;
                    "media_path": string;
                    "attempt_count": number | null;
                    "next_attempt_at": string | null;
                    "last_error": string | null;
                    "created_at": string | null;
                    "updated_at": string | null;
                };
                Insert: {
                    "nix_id": string;
                    "receiver_id": string;
                    "media_path": string;
                    "attempt_count"?: number | null;
                    "next_attempt_at"?: string | null;
                    "last_error"?: string | null;
                    "created_at"?: string | null;
                    "updated_at"?: string | null;
                };
                Update: {
                    "nix_id"?: string;
                    "receiver_id"?: string;
                    "media_path"?: string;
                    "attempt_count"?: number | null;
                    "next_attempt_at"?: string | null;
                    "last_error"?: string | null;
                    "created_at"?: string | null;
                    "updated_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "snap_cleanup_queue_receiver_id_fkey";
                        columns: [
                            "receiver_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "snap_cleanup_queue_snap_id_fkey";
                        columns: [
                            "nix_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "nixes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "nixes": {
                Row: {
                    "id": string;
                    "sender_id": string;
                    "receiver_id": string;
                    "media_path": string;
                    "media_type": string | null;
                    "is_viewed": boolean | null;
                    "created_at": string | null;
                    "viewed_at": string | null;
                    "status": string;
                    "cleaned_at": string | null;
                    "view_duration_sec": number;
                    "playback_duration_ms": number | null;
                    "client_upload_id": string | null;
                    "thumbnail_b64": string | null;
                    "is_replayed": boolean;
                    "replay_expires_at": string | null;
                    "asset_id": string | null;
                };
                Insert: {
                    "id"?: string;
                    "sender_id": string;
                    "receiver_id": string;
                    "media_path": string;
                    "media_type"?: string | null;
                    "is_viewed"?: boolean | null;
                    "created_at"?: string | null;
                    "viewed_at"?: string | null;
                    "status"?: string;
                    "cleaned_at"?: string | null;
                    "view_duration_sec"?: number;
                    "playback_duration_ms"?: number | null;
                    "client_upload_id"?: string | null;
                    "thumbnail_b64"?: string | null;
                    "is_replayed"?: boolean;
                    "replay_expires_at"?: string | null;
                    "asset_id"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "sender_id"?: string;
                    "receiver_id"?: string;
                    "media_path"?: string;
                    "media_type"?: string | null;
                    "is_viewed"?: boolean | null;
                    "created_at"?: string | null;
                    "viewed_at"?: string | null;
                    "status"?: string;
                    "cleaned_at"?: string | null;
                    "view_duration_sec"?: number;
                    "playback_duration_ms"?: number | null;
                    "client_upload_id"?: string | null;
                    "thumbnail_b64"?: string | null;
                    "is_replayed"?: boolean;
                    "replay_expires_at"?: string | null;
                    "asset_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "snaps_receiver_id_fkey";
                        columns: [
                            "receiver_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "snaps_sender_id_fkey";
                        columns: [
                            "sender_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "nixes_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "media_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "notification_preferences": {
                Row: {
                    "user_id": string;
                    "messages_enabled": boolean;
                    "reactions_enabled": boolean;
                    "friends_enabled": boolean;
                    "updated_at": string;
                };
                Insert: {
                    "user_id": string;
                    "messages_enabled"?: boolean;
                    "reactions_enabled"?: boolean;
                    "friends_enabled"?: boolean;
                    "updated_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "messages_enabled"?: boolean;
                    "reactions_enabled"?: boolean;
                    "friends_enabled"?: boolean;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notification_preferences_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "product_analytics_daily": {
                Row: {
                    "event_date": string;
                    "event_name": string;
                    "locale": string;
                    "event_count": number;
                };
                Insert: {
                    "event_date": string;
                    "event_name": string;
                    "locale": string;
                    "event_count": number;
                };
                Update: {
                    "event_date"?: string;
                    "event_name"?: string;
                    "locale"?: string;
                    "event_count"?: number;
                };
                Relationships: [
                ];
            };
            "product_analytics_events": {
                Row: {
                    "id": number;
                    "installation_id": string;
                    "event_name": string;
                    "app_version": string | null;
                    "locale": string;
                    "properties": Json;
                    "created_at": string;
                };
                Insert: {
                    "id"?: number;
                    "installation_id": string;
                    "event_name": string;
                    "app_version"?: string | null;
                    "locale": string;
                    "properties"?: Json;
                    "created_at"?: string;
                };
                Update: {
                    "id"?: number;
                    "installation_id"?: string;
                    "event_name"?: string;
                    "app_version"?: string | null;
                    "locale"?: string;
                    "properties"?: Json;
                    "created_at"?: string;
                };
                Relationships: [
                ];
            };
            "product_analytics_preferences": {
                Row: {
                    "user_id": string;
                    "enabled": boolean;
                    "policy_version": string;
                    "updated_at": string;
                };
                Insert: {
                    "user_id": string;
                    "enabled"?: boolean;
                    "policy_version"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "enabled"?: boolean;
                    "policy_version"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "product_analytics_preferences_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "profiles": {
                Row: {
                    "id": string;
                    "username": string | null;
                    "apple_id": string | null;
                    "created_at": string | null;
                    "avatar_storage_path": string | null;
                    "avatar_emoji": string | null;
                    "display_name": string | null;
                    "is_private": boolean;
                    "bio": string | null;
                };
                Insert: {
                    "id": string;
                    "username"?: string | null;
                    "apple_id"?: string | null;
                    "created_at"?: string | null;
                    "avatar_storage_path"?: string | null;
                    "avatar_emoji"?: string | null;
                    "display_name"?: string | null;
                    "is_private"?: boolean;
                    "bio"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "username"?: string | null;
                    "apple_id"?: string | null;
                    "created_at"?: string | null;
                    "avatar_storage_path"?: string | null;
                    "avatar_emoji"?: string | null;
                    "display_name"?: string | null;
                    "is_private"?: boolean;
                    "bio"?: string | null;
                };
                Relationships: [
                ];
            };
            "push_devices": {
                Row: {
                    "id": string;
                    "installation_id": string;
                    "user_id": string;
                    "expo_push_token": string;
                    "native_push_token": string | null;
                    "platform": string;
                    "locale": string;
                    "app_version": string | null;
                    "enabled": boolean;
                    "disabled_reason": string | null;
                    "last_seen_at": string;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "id"?: string;
                    "installation_id": string;
                    "user_id": string;
                    "expo_push_token": string;
                    "native_push_token"?: string | null;
                    "platform": string;
                    "locale"?: string;
                    "app_version"?: string | null;
                    "enabled"?: boolean;
                    "disabled_reason"?: string | null;
                    "last_seen_at"?: string;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "installation_id"?: string;
                    "user_id"?: string;
                    "expo_push_token"?: string;
                    "native_push_token"?: string | null;
                    "platform"?: string;
                    "locale"?: string;
                    "app_version"?: string | null;
                    "enabled"?: boolean;
                    "disabled_reason"?: string | null;
                    "last_seen_at"?: string;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "push_devices_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "push_notification_deliveries": {
                Row: {
                    "id": string;
                    "job_id": string;
                    "device_id": string;
                    "expo_ticket_id": string | null;
                    "status": string;
                    "error_code": string | null;
                    "ticket_received_at": string | null;
                    "next_receipt_check_at": string | null;
                    "receipt_checked_at": string | null;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "id"?: string;
                    "job_id": string;
                    "device_id": string;
                    "expo_ticket_id"?: string | null;
                    "status": string;
                    "error_code"?: string | null;
                    "ticket_received_at"?: string | null;
                    "next_receipt_check_at"?: string | null;
                    "receipt_checked_at"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "job_id"?: string;
                    "device_id"?: string;
                    "expo_ticket_id"?: string | null;
                    "status"?: string;
                    "error_code"?: string | null;
                    "ticket_received_at"?: string | null;
                    "next_receipt_check_at"?: string | null;
                    "receipt_checked_at"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "push_notification_deliveries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "push_notification_jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "push_notification_deliveries_device_id_fkey";
                        columns: [
                            "device_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "push_devices";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "push_notification_jobs": {
                Row: {
                    "id": string;
                    "event_type": string;
                    "event_key": string;
                    "recipient_id": string;
                    "actor_id": string;
                    "entity_id": string;
                    "status": string;
                    "attempts": number;
                    "next_attempt_at": string;
                    "locked_at": string | null;
                    "last_error": string | null;
                    "created_at": string;
                    "updated_at": string;
                };
                Insert: {
                    "id"?: string;
                    "event_type": string;
                    "event_key": string;
                    "recipient_id": string;
                    "actor_id": string;
                    "entity_id": string;
                    "status"?: string;
                    "attempts"?: number;
                    "next_attempt_at"?: string;
                    "locked_at"?: string | null;
                    "last_error"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "id"?: string;
                    "event_type"?: string;
                    "event_key"?: string;
                    "recipient_id"?: string;
                    "actor_id"?: string;
                    "entity_id"?: string;
                    "status"?: string;
                    "attempts"?: number;
                    "next_attempt_at"?: string;
                    "locked_at"?: string | null;
                    "last_error"?: string | null;
                    "created_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "push_notification_jobs_recipient_id_fkey";
                        columns: [
                            "recipient_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "push_notification_jobs_actor_id_fkey";
                        columns: [
                            "actor_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "text_messages": {
                Row: {
                    "id": string;
                    "sender_id": string;
                    "receiver_id": string;
                    "body": string;
                    "created_at": string;
                    "expires_at": string;
                    "client_message_id": string | null;
                    "metadata": Json | null;
                    "is_system": boolean;
                };
                Insert: {
                    "id"?: string;
                    "sender_id": string;
                    "receiver_id": string;
                    "body": string;
                    "created_at"?: string;
                    "expires_at"?: string;
                    "client_message_id"?: string | null;
                    "metadata"?: Json | null;
                    "is_system"?: boolean;
                };
                Update: {
                    "id"?: string;
                    "sender_id"?: string;
                    "receiver_id"?: string;
                    "body"?: string;
                    "created_at"?: string;
                    "expires_at"?: string;
                    "client_message_id"?: string | null;
                    "metadata"?: Json | null;
                    "is_system"?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "text_messages_sender_id_fkey";
                        columns: [
                            "sender_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "text_messages_receiver_id_fkey";
                        columns: [
                            "receiver_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "upload_logs": {
                Row: {
                    "id": string;
                    "task_id": string;
                    "upload_flow_id": string | null;
                    "sender_id": string | null;
                    "receiver_id": string | null;
                    "media_type": string;
                    "status": string;
                    "retry_count": number;
                    "failure_stage": string | null;
                    "error_message": string | null;
                    "connection_type": string | null;
                    "original_size_bytes": number | null;
                    "final_size_bytes": number | null;
                    "compression_ratio": number | null;
                    "compression_duration_ms": number | null;
                    "upload_duration_ms": number | null;
                    "end_to_end_duration_ms": number | null;
                    "created_at": string | null;
                };
                Insert: {
                    "id"?: string;
                    "task_id": string;
                    "upload_flow_id"?: string | null;
                    "sender_id"?: string | null;
                    "receiver_id"?: string | null;
                    "media_type": string;
                    "status": string;
                    "retry_count"?: number;
                    "failure_stage"?: string | null;
                    "error_message"?: string | null;
                    "connection_type"?: string | null;
                    "original_size_bytes"?: number | null;
                    "final_size_bytes"?: number | null;
                    "compression_ratio"?: number | null;
                    "compression_duration_ms"?: number | null;
                    "upload_duration_ms"?: number | null;
                    "end_to_end_duration_ms"?: number | null;
                    "created_at"?: string | null;
                };
                Update: {
                    "id"?: string;
                    "task_id"?: string;
                    "upload_flow_id"?: string | null;
                    "sender_id"?: string | null;
                    "receiver_id"?: string | null;
                    "media_type"?: string;
                    "status"?: string;
                    "retry_count"?: number;
                    "failure_stage"?: string | null;
                    "error_message"?: string | null;
                    "connection_type"?: string | null;
                    "original_size_bytes"?: number | null;
                    "final_size_bytes"?: number | null;
                    "compression_ratio"?: number | null;
                    "compression_duration_ms"?: number | null;
                    "upload_duration_ms"?: number | null;
                    "end_to_end_duration_ms"?: number | null;
                    "created_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "upload_logs_receiver_id_fkey";
                        columns: [
                            "receiver_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "upload_logs_sender_id_fkey";
                        columns: [
                            "sender_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "user_activation_state": {
                Row: {
                    "user_id": string;
                    "skipped_at": string | null;
                    "dismissed_at": string | null;
                    "completed_at": string | null;
                    "last_shown_at": string | null;
                    "updated_at": string;
                };
                Insert: {
                    "user_id": string;
                    "skipped_at"?: string | null;
                    "dismissed_at"?: string | null;
                    "completed_at"?: string | null;
                    "last_shown_at"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "user_id"?: string;
                    "skipped_at"?: string | null;
                    "dismissed_at"?: string | null;
                    "completed_at"?: string | null;
                    "last_shown_at"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_activation_state_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "user_blocks": {
                Row: {
                    "blocker_id": string;
                    "blocked_id": string;
                    "created_at": string;
                };
                Insert: {
                    "blocker_id": string;
                    "blocked_id": string;
                    "created_at"?: string;
                };
                Update: {
                    "blocker_id"?: string;
                    "blocked_id"?: string;
                    "created_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_blocks_blocker_id_fkey";
                        columns: [
                            "blocker_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "user_blocks_blocked_id_fkey";
                        columns: [
                            "blocked_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
        };
        Views: Record<never, never>;
        Functions: {
            "archive_blocked_shared_media": {
                Args: {
                    "p_user_a": string | null;
                    "p_user_b": string | null;
                };
                Returns: ({
                    "asset_id": string;
                    "storage_path": string;
                })[];
            };
            "archive_shared_media_nix": {
                Args: {
                    "p_nix_id": string | null;
                    "p_receiver_id": string | null;
                };
                Returns: ({
                    "asset_id": string;
                    "storage_path": string;
                    "should_delete": boolean;
                    "already_cleaned": boolean;
                })[];
            };
            "begin_media_upload_batch": {
                Args: {
                    "p_idempotency_key": string | null;
                    "p_finalize_token_hash": string | null;
                    "p_media_type": string | null;
                    "p_content_type": string | null;
                    "p_size_bytes": number | null;
                    "p_file_extension": string | null;
                    "p_playback_duration_ms": number | null;
                    "p_thumbnail_b64": string | null;
                    "p_recipients": Json | null;
                };
                Returns: ({
                    "batch_id": string;
                    "asset_id": string;
                    "storage_path": string;
                    "batch_status": string;
                    "expires_at": string;
                })[];
            };
            "block_user": {
                Args: {
                    "p_blocked_user_id": string | null;
                };
                Returns: undefined;
            };
            "can_send_nix": {
                Args: {
                    "sender": string | null;
                    "receiver": string | null;
                };
                Returns: boolean;
            };
            "can_send_text_message": {
                Args: {
                    "sender": string | null;
                    "receiver": string | null;
                };
                Returns: boolean;
            };
            "cancel_media_upload_batch": {
                Args: {
                    "p_batch_id": string | null;
                    "p_sender_id": string | null;
                };
                Returns: ({
                    "storage_path": string;
                    "asset_id": string;
                })[];
            };
            "cancel_own_text_moderation_job": {
                Args: {
                    "p_receiver_id": string | null;
                    "p_client_message_id": string | null;
                };
                Returns: string;
            };
            "claim_approved_unmaterialized_moderation_jobs": {
                Args: {
                    "p_lease_owner": string | null;
                    "p_limit"?: number | null;
                };
                Returns: (Database['public']['Tables']["moderation_jobs"]['Row'])[];
            };
            "claim_moderation_jobs": {
                Args: {
                    "p_limit"?: number | null;
                    "p_lease_owner"?: string | null;
                    "p_lease_seconds"?: number | null;
                };
                Returns: (Database['public']['Tables']["moderation_jobs"]['Row'])[];
            };
            "claim_push_notification_jobs": {
                Args: {
                    "p_limit"?: number | null;
                };
                Returns: (Database['public']['Tables']["push_notification_jobs"]['Row'])[];
            };
            "cleanup_expired_data_exports": {
                Args: Record<PropertyKey, never>;
                Returns: undefined;
            };
            "cleanup_expired_moderation_quarantine": {
                Args: Record<PropertyKey, never>;
                Returns: number;
            };
            "complete_moderation_job": {
                Args: {
                    "p_job_id": string | null;
                    "p_lease_owner": string | null;
                    "p_status": Database['public']['Enums']["moderation_job_status"] | null;
                    "p_decision"?: string | null;
                    "p_policy_version"?: string | null;
                    "p_max_severity"?: number | null;
                    "p_provider_operation_id"?: string | null;
                    "p_last_error"?: string | null;
                    "p_retry_delay_seconds"?: number | null;
                    "p_waiting_reason"?: string | null;
                    "p_next_attempt_at_month_rollover"?: boolean | null;
                };
                Returns: Database['public']['Tables']["moderation_jobs"]['Row'];
            };
            "confirm_moderation_budget": {
                Args: {
                    "p_reservation_id": string | null;
                };
                Returns: undefined;
            };
            "create_content_report_v2": {
                Args: {
                    "p_reason": string | null;
                    "p_nix_id"?: string | null;
                    "p_text_message_id"?: string | null;
                    "p_reported_user_id"?: string | null;
                    "p_details"?: string | null;
                };
                Returns: ({
                    "report_id": string;
                    "media_path": string;
                    "media_type": string;
                    "reported_user_id": string;
                    "evidence_expires_at": string;
                    "text_message_id": string;
                })[];
            };
            "create_friend_invite": {
                Args: {
                    "invite_channel": string | null;
                };
                Returns: ({
                    "invite_token": string;
                    "expires_at": string;
                })[];
            };
            "delete_my_account_data": {
                Args: {
                    "p_user_id": string | null;
                };
                Returns: ({
                    "media_path": string;
                    "avatar_path": string;
                })[];
            };
            "delete_my_conversation_with_peer": {
                Args: {
                    "peer_profile_id": string | null;
                };
                Returns: number;
            };
            "disable_push_device": {
                Args: {
                    "p_installation_id": string | null;
                    "p_reason"?: string | null;
                };
                Returns: undefined;
            };
            "enqueue_own_text_moderation_job": {
                Args: {
                    "p_receiver_id": string | null;
                    "p_body": string | null;
                    "p_client_message_id"?: string | null;
                };
                Returns: Json;
            };
            "enqueue_text_moderation_job": {
                Args: {
                    "p_sender_id": string | null;
                    "p_receiver_id": string | null;
                    "p_body": string | null;
                    "p_client_message_id"?: string | null;
                };
                Returns: Json;
            };
            "fetch_inbox_nixes_paginated": {
                Args: {
                    "page_limit"?: number | null;
                    "before_created_at"?: string | null;
                };
                Returns: (Database['public']['Tables']["nixes"]['Row'])[];
            };
            "fetch_message_reactions_with_peer": {
                Args: {
                    "peer_id": string | null;
                };
                Returns: ({
                    "id": string;
                    "message_id": string;
                    "user_id": string;
                    "emoji": string;
                    "created_at": string;
                    "updated_at": string;
                })[];
            };
            "fetch_sent_nixes_paginated": {
                Args: {
                    "page_limit"?: number | null;
                    "before_created_at"?: string | null;
                };
                Returns: (Database['public']['Tables']["nixes"]['Row'])[];
            };
            "fetch_text_messages_with_peer": {
                Args: {
                    "peer_id": string | null;
                    "before_created_at"?: string | null;
                    "msg_limit"?: number | null;
                };
                Returns: ({
                    "id": string;
                    "sender_id": string;
                    "receiver_id": string;
                    "body": string;
                    "created_at": string;
                    "expires_at": string;
                    "client_message_id": string;
                    "metadata": Json;
                    "is_system": boolean;
                })[];
            };
            "finalize_media_upload_batch": {
                Args: {
                    "p_batch_id": string | null;
                    "p_finalize_token_hash": string | null;
                };
                Returns: Json;
            };
            "finish_data_export_cleanup": {
                Args: {
                    "p_job_id": string | null;
                    "p_error"?: string | null;
                };
                Returns: undefined;
            };
            "finish_nix_cleanup": {
                Args: {
                    "p_nix_id": string | null;
                    "p_removed"?: boolean | null;
                    "p_error"?: string | null;
                };
                Returns: undefined;
            };
            "get_capture_policy_for_sender": {
                Args: {
                    "sender_id": string | null;
                };
                Returns: string;
            };
            "get_own_media_moderation_job": {
                Args: {
                    "p_job_id": string | null;
                };
                Returns: Json;
            };
            "get_own_text_moderation_job": {
                Args: {
                    "p_job_id": string | null;
                };
                Returns: Json;
            };
            "get_public_profile_by_username": {
                Args: {
                    "search_username": string | null;
                };
                Returns: ({
                    "id": string;
                    "username": string;
                    "display_name": string;
                    "avatar_storage_path": string;
                    "avatar_emoji": string;
                })[];
            };
            "get_public_profiles_by_ids": {
                Args: {
                    "profile_ids": (string)[] | null;
                };
                Returns: ({
                    "id": string;
                    "username": string;
                    "display_name": string;
                    "avatar_storage_path": string;
                    "avatar_emoji": string;
                })[];
            };
            "get_push_device_state": {
                Args: {
                    "p_installation_id": string | null;
                };
                Returns: ({
                    "enabled": boolean;
                    "exists": boolean;
                })[];
            };
            "get_unread_inbox_count": {
                Args: Record<PropertyKey, never>;
                Returns: number;
            };
            "get_unread_inbox_count_for_user": {
                Args: {
                    "p_user_id": string | null;
                };
                Returns: number;
            };
            "get_user_activation_state": {
                Args: Record<PropertyKey, never>;
                Returns: ({
                    "has_friend": boolean;
                    "has_sent_nix": boolean;
                    "skipped_at": string;
                    "dismissed_at": string;
                    "completed_at": string;
                    "last_shown_at": string;
                })[];
            };
            "list_accepted_friends_paginated": {
                Args: {
                    "page_limit"?: number | null;
                    "before_created_at"?: string | null;
                };
                Returns: ({
                    "id": string;
                    "username": string;
                    "display_name": string;
                    "bio": string;
                    "avatar_storage_path": string;
                    "avatar_emoji": string;
                    "friendship_created_at": string;
                })[];
            };
            "list_blocked_users": {
                Args: Record<PropertyKey, never>;
                Returns: ({
                    "blocked_user_id": string;
                    "username": string;
                    "avatar_storage_path": string;
                    "avatar_emoji": string;
                    "blocked_at": string;
                })[];
            };
            "list_moderation_evidence_orphans": {
                Args: Record<PropertyKey, never>;
                Returns: ({
                    "object_name": string;
                    "created_at": string;
                    "eligible": boolean;
                })[];
            };
            "list_my_content_reports": {
                Args: Record<PropertyKey, never>;
                Returns: ({
                    "id": string;
                    "reported_user_id": string;
                    "reported_username": string;
                    "reason": string;
                    "status": string;
                    "priority": string;
                    "created_at": string;
                    "resolved_at": string;
                })[];
            };
            "log_cleanup_audit": {
                Args: {
                    "p_nix_id": string | null;
                    "p_receiver_id": string | null;
                    "p_media_path": string | null;
                    "p_status": string | null;
                    "p_error_message"?: string | null;
                };
                Returns: undefined;
            };
            "mark_expired_media_uploads": {
                Args: Record<PropertyKey, never>;
                Returns: ({
                    "asset_id": string;
                    "storage_path": string;
                })[];
            };
            "mark_moderation_job_materialized": {
                Args: {
                    "p_job_id": string | null;
                };
                Returns: Database['public']['Tables']["moderation_jobs"]['Row'];
            };
            "mark_nix_replayed": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: undefined;
            };
            "mark_nix_unplayable": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: undefined;
            };
            "mark_nix_viewed_for_replay": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: undefined;
            };
            "mark_text_conversation_read": {
                Args: {
                    "peer_id": string | null;
                    "read_through": string | null;
                };
                Returns: string;
            };
            "materialize_approved_media_batch": {
                Args: {
                    "p_job_id": string | null;
                };
                Returns: Json;
            };
            "materialize_approved_text_message": {
                Args: {
                    "p_job_id": string | null;
                };
                Returns: string;
            };
            "moderation_decide_report": {
                Args: {
                    "p_report_id": string | null;
                    "p_decision": string | null;
                    "p_note"?: string | null;
                    "p_suspension_hours"?: number | null;
                };
                Returns: undefined;
            };
            "moderation_record_appeal": {
                Args: {
                    "p_report_id": string | null;
                    "p_outcome": string | null;
                    "p_note": string | null;
                };
                Returns: undefined;
            };
            "moderation_remove_reported_content": {
                Args: {
                    "p_report_id": string | null;
                };
                Returns: undefined;
            };
            "prepare_nix_cleanup": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: ({
                    "asset_id": string;
                    "storage_path": string;
                    "should_delete": boolean;
                    "already_cleaned": boolean;
                })[];
            };
            "preview_friend_invite": {
                Args: {
                    "invite_token": string | null;
                };
                Returns: ({
                    "status": string;
                    "profile_id": string;
                    "username": string;
                    "display_name": string;
                    "avatar_storage_path": string;
                    "avatar_emoji": string;
                })[];
            };
            "prune_push_notification_history": {
                Args: Record<PropertyKey, never>;
                Returns: number;
            };
            "record_age_attestation": {
                Args: {
                    "p_policy_version": string | null;
                };
                Returns: Database['public']['Tables']["age_attestations"]['Row'];
            };
            "record_product_analytics_event": {
                Args: {
                    "p_installation_id": string | null;
                    "p_event_name": string | null;
                    "p_app_version": string | null;
                    "p_locale": string | null;
                    "p_properties"?: Json | null;
                };
                Returns: boolean;
            };
            "redeem_friend_invite": {
                Args: {
                    "invite_token": string | null;
                };
                Returns: ({
                    "result": string;
                    "friend_id": string;
                })[];
            };
            "register_app_installation": {
                Args: {
                    "p_installation_id": string | null;
                    "p_device_name": string | null;
                    "p_system_version": string | null;
                    "p_app_version": string | null;
                    "p_locale": string | null;
                };
                Returns: undefined;
            };
            "register_push_device": {
                Args: {
                    "p_installation_id": string | null;
                    "p_expo_push_token": string | null;
                    "p_native_push_token": string | null;
                    "p_platform": string | null;
                    "p_locale": string | null;
                    "p_app_version": string | null;
                };
                Returns: undefined;
            };
            "release_moderation_budget_if_unused": {
                Args: {
                    "p_reservation_id": string | null;
                };
                Returns: undefined;
            };
            "remove_message_reaction": {
                Args: {
                    "p_message_id": string | null;
                };
                Returns: boolean;
            };
            "report_capture_attempt": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: undefined;
            };
            "request_data_export": {
                Args: Record<PropertyKey, never>;
                Returns: Database['public']['Tables']["data_export_jobs"]['Row'];
            };
            "request_nix_cleanup": {
                Args: {
                    "p_nix_id": string | null;
                };
                Returns: ({
                    "cleanup_requested": boolean;
                    "next_attempt_at": string;
                })[];
            };
            "reserve_moderation_budget": {
                Args: {
                    "p_category": string | null;
                    "p_units": number | null;
                    "p_job_id": string | null;
                    "p_attempt_id": string | null;
                    "p_hard_budget"?: number | null;
                    "p_external_used"?: number | null;
                };
                Returns: Json;
            };
            "revoke_other_app_installations": {
                Args: {
                    "p_current_installation_id": string | null;
                };
                Returns: number;
            };
            "rollup_and_cleanup_product_analytics": {
                Args: Record<PropertyKey, never>;
                Returns: undefined;
            };
            "set_conversation_mute": {
                Args: {
                    "p_peer_id": string | null;
                    "p_muted_until": string | null;
                    "p_indefinite"?: boolean | null;
                };
                Returns: undefined;
            };
            "set_notification_preferences": {
                Args: {
                    "p_messages_enabled": boolean | null;
                    "p_reactions_enabled": boolean | null;
                    "p_friends_enabled": boolean | null;
                };
                Returns: Database['public']['Tables']["notification_preferences"]['Row'];
            };
            "set_product_analytics_consent": {
                Args: {
                    "p_enabled": boolean | null;
                };
                Returns: undefined;
            };
            "touch_push_device": {
                Args: {
                    "p_installation_id": string | null;
                    "p_locale"?: string | null;
                    "p_app_version"?: string | null;
                };
                Returns: undefined;
            };
            "unblock_user": {
                Args: {
                    "p_blocked_user_id": string | null;
                };
                Returns: undefined;
            };
            "update_user_activation_state": {
                Args: {
                    "p_action": string | null;
                };
                Returns: undefined;
            };
            "upsert_message_reaction": {
                Args: {
                    "p_message_id": string | null;
                    "p_emoji": string | null;
                };
                Returns: Database['public']['Tables']["message_reactions"]['Row'];
            };
        };
        Enums: {
            "moderation_content_kind": "text" | "media";
            "moderation_job_status": "pending" | "processing" | "approved" | "rejected" | "error";
        };
        CompositeTypes: Record<never, never>;
    };
};

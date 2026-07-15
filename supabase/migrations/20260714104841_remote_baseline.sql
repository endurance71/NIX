-- Consolidated from the linked production schema on 2026-07-15.
-- Schema only: no user rows, storage objects, credentials or secrets.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."can_send_nix"("sender" "uuid", "receiver" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  friendship_exists BOOLEAN;
  recent_count INT;
BEGIN
  IF auth.uid() IS NULL OR sender IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  IF sender IS NULL OR receiver IS NULL OR sender = receiver THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = sender AND f.friend_id = receiver)
        OR
        (f.user_id = receiver AND f.friend_id = sender)
      )
  ) INTO friendship_exists;

  IF NOT friendship_exists THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)
    INTO recent_count
  FROM public.nixes n
  WHERE n.sender_id = sender
    AND n.created_at > NOW() - INTERVAL '1 minute';

  RETURN recent_count < 20;
END;
$$;

ALTER FUNCTION "public"."can_send_nix"("sender" "uuid", "receiver" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_friend_invite"("invite_channel" "text") RETURNS TABLE("invite_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  token_plain text;
  token_digest text;
  expiration timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if lower(trim(invite_channel)) <> 'qr' then
    raise exception 'Invalid invite channel';
  end if;

  token_plain := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  token_digest := md5(token_plain);
  expiration := now() + interval '5 minutes';

  insert into public.friend_invites (created_by, token_hash, channel, expires_at)
  values (auth.uid(), token_digest, 'qr', expiration);

  return query select token_plain, expiration;
end;
$$;


ALTER FUNCTION "public"."create_friend_invite"("invite_channel" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_conversation_with_peer"("peer_profile_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if peer_profile_id is null or peer_profile_id = auth.uid() then
    raise exception 'Invalid peer id';
  end if;

  delete from public.snaps s
  where
    (s.sender_id = auth.uid() and s.receiver_id = peer_profile_id)
    or (s.receiver_id = auth.uid() and s.sender_id = peer_profile_id);

  get diagnostics deleted_count = row_count;
  return coalesce(deleted_count, 0);
end;
$$;


ALTER FUNCTION "public"."delete_my_conversation_with_peer"("peer_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_capture_policy_for_sender"("sender_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT scp.capture_policy
      FROM public.snap_capture_prefs scp
      WHERE scp.owner_user_id = auth.uid()
        AND scp.friend_user_id = sender_id
      LIMIT 1
    ),
    'deny'
  );
$$;


ALTER FUNCTION "public"."get_capture_policy_for_sender"("sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_profile_by_username"("search_username" "text") RETURNS TABLE("id" "uuid", "username" "text", "avatar_storage_path" "text", "avatar_emoji" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND lower(p.username) = lower(search_username)
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_public_profile_by_username"("search_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_profiles_by_ids"("profile_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "username" "text", "avatar_storage_path" "text", "avatar_emoji" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = ANY(profile_ids)
    AND p.username IS NOT NULL
  ORDER BY p.username ASC;
$$;


ALTER FUNCTION "public"."get_public_profiles_by_ids"("profile_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_cleanup_audit"("p_nix_id" "uuid", "p_receiver_id" "uuid", "p_media_path" "text", "p_status" "text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.nix_cleanup_audit (nix_id, receiver_id, media_path, status, error_message)
  VALUES (p_nix_id, p_receiver_id, p_media_path, p_status, p_error_message);
$$;


ALTER FUNCTION "public"."log_cleanup_audit"("p_nix_id" "uuid", "p_receiver_id" "uuid", "p_media_path" "text", "p_status" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_nix_payload_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM NEW.sender_id
    OR OLD.receiver_id IS DISTINCT FROM NEW.receiver_id
    OR OLD.media_path IS DISTINCT FROM NEW.media_path
    OR OLD.media_type IS DISTINCT FROM NEW.media_type
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Only viewed status can be updated on snaps';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_nix_payload_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_username_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Username cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_username_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_friend_invite"("invite_token" "text") RETURNS TABLE("status" "text", "profile_id" "uuid", "username" "text", "avatar_storage_path" "text", "avatar_emoji" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inviter_id UUID;
  requester_id UUID;
  token_digest TEXT;
BEGIN
  requester_id := auth.uid();
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  token_digest := md5(invite_token);

  SELECT fi.created_by
  INTO inviter_id
  FROM public.friend_invites fi
  WHERE fi.token_hash = token_digest
    AND fi.used_at IS NULL
    AND fi.expires_at > NOW()
  LIMIT 1;

  IF inviter_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF inviter_id = requester_id THEN
    RETURN QUERY SELECT 'own_invite'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.friend_invites fi
  SET previewed_by = requester_id, previewed_at = NOW()
  WHERE fi.token_hash = token_digest
    AND fi.used_at IS NULL
    AND fi.expires_at > NOW();

  RETURN QUERY
  SELECT
    'ok'::TEXT,
    p.id,
    p.username,
    p.avatar_storage_path,
    p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = inviter_id
    AND p.username IS NOT NULL
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."preview_friend_invite"("invite_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_friend_invite"("invite_token" "text") RETURNS TABLE("result" "text", "friend_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inviter_id uuid;
  actor_user uuid;
  token_digest text;
  pending_row_id uuid;
begin
  actor_user := auth.uid();
  if actor_user is null then
    raise exception 'Authentication required';
  end if;

  if invite_token is null or char_length(invite_token) < 16 then
    raise exception 'Invalid invite token';
  end if;

  token_digest := md5(invite_token);

  update public.friend_invites fi
  set used_at = now(), used_by = actor_user
  where fi.token_hash = token_digest
    and fi.used_at is null
    and fi.expires_at > now()
  returning fi.created_by into inviter_id;

  if inviter_id is null then
    raise exception 'Invite token expired, invalid, or already used';
  end if;

  if inviter_id = actor_user then
    raise exception 'Cannot redeem your own invite';
  end if;

  if exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = actor_user and f.friend_id = inviter_id)
        or
        (f.user_id = inviter_id and f.friend_id = actor_user)
      )
  ) then
    return query select 'already_friends'::text, inviter_id;
    return;
  end if;

  if exists (
    select 1
    from public.friendships f
    where f.status = 'pending'
      and f.user_id = actor_user
      and f.friend_id = inviter_id
  ) then
    return query select 'already_requested'::text, inviter_id;
    return;
  end if;

  select f.id
  into pending_row_id
  from public.friendships f
  where f.status = 'pending'
    and f.user_id = inviter_id
    and f.friend_id = actor_user
  limit 1;

  if pending_row_id is not null then
    update public.friendships f
    set status = 'accepted'
    where f.id = pending_row_id;
    return query select 'accepted_reverse_request'::text, inviter_id;
    return;
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values (actor_user, inviter_id, 'pending');

  return query select 'request_sent'::text, inviter_id;
end;
$$;


ALTER FUNCTION "public"."redeem_friend_invite"("invite_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friend_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "previewed_by" "uuid",
    "previewed_at" timestamp with time zone,
    CONSTRAINT "friend_invites_channel_check" CHECK (("channel" = 'qr'::"text"))
);


ALTER TABLE "public"."friend_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nix_capture_prefs" (
    "owner_user_id" "uuid" NOT NULL,
    "friend_user_id" "uuid" NOT NULL,
    "capture_policy" "text" DEFAULT 'deny'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "snap_capture_prefs_capture_policy_check" CHECK (("capture_policy" = ANY (ARRAY['deny'::"text", 'allow'::"text"]))),
    CONSTRAINT "snap_capture_prefs_not_self" CHECK (("owner_user_id" <> "friend_user_id"))
);


ALTER TABLE "public"."nix_capture_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nix_cleanup_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nix_id" "uuid",
    "receiver_id" "uuid",
    "media_path" "text",
    "status" "text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "snap_cleanup_audit_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'success'::"text", 'failed'::"text", 'not_found'::"text", 'forbidden'::"text"])))
);


ALTER TABLE "public"."nix_cleanup_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nix_cleanup_queue" (
    "nix_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "media_path" "text" NOT NULL,
    "attempt_count" integer DEFAULT 0,
    "next_attempt_at" timestamp with time zone DEFAULT "now"(),
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nix_cleanup_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nixes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "media_path" "text" NOT NULL,
    "media_type" "text" DEFAULT 'image'::"text",
    "is_viewed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "viewed_at" timestamp with time zone,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "cleaned_at" timestamp with time zone,
    "view_duration_sec" integer DEFAULT 5 NOT NULL,
    "playback_duration_ms" integer,
    "client_upload_id" "text",
    "thumbnail_b64" "text",
    CONSTRAINT "nixes_client_upload_id_len" CHECK ((("client_upload_id" IS NULL) OR (("char_length"("client_upload_id") >= 1) AND ("char_length"("client_upload_id") <= 128)))),
    CONSTRAINT "nixes_playback_duration_positive" CHECK ((("playback_duration_ms" IS NULL) OR ("playback_duration_ms" > 0))),
    CONSTRAINT "nixes_thumbnail_b64_data_url" CHECK ((("thumbnail_b64" IS NULL) OR ("thumbnail_b64" ~~ 'data:image/%;base64,%'::"text"))),
    CONSTRAINT "snaps_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "snaps_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'viewed'::"text", 'cleaned'::"text", 'cleanup_failed'::"text"]))),
    CONSTRAINT "snaps_view_duration_sec_check" CHECK (("view_duration_sec" = ANY (ARRAY[5, 15, 30, 60, 180])))
);


ALTER TABLE "public"."nixes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "apple_id" "text",
    "push_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_storage_path" "text",
    "avatar_emoji" "text",
    CONSTRAINT "profiles_avatar_emoji_length" CHECK ((("avatar_emoji" IS NULL) OR ("char_length"("avatar_emoji") <= 32))),
    CONSTRAINT "profiles_avatar_exclusive" CHECK ((NOT (("avatar_storage_path" IS NOT NULL) AND ("avatar_emoji" IS NOT NULL)))),
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."upload_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "upload_flow_id" "text",
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "media_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "failure_stage" "text",
    "error_message" "text",
    "connection_type" "text",
    "original_size_bytes" bigint,
    "final_size_bytes" bigint,
    "compression_ratio" numeric(5,2),
    "compression_duration_ms" integer,
    "upload_duration_ms" integer,
    "end_to_end_duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "upload_logs_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "upload_logs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'success'::"text", 'failed'::"text", 'retrying'::"text"])))
);


ALTER TABLE "public"."upload_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."friend_invites"
    ADD CONSTRAINT "friend_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_invites"
    ADD CONSTRAINT "friend_invites_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_friend_id_key" UNIQUE ("user_id", "friend_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_apple_id_key" UNIQUE ("apple_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."nix_capture_prefs"
    ADD CONSTRAINT "snap_capture_prefs_pkey" PRIMARY KEY ("owner_user_id", "friend_user_id");



ALTER TABLE ONLY "public"."nix_cleanup_audit"
    ADD CONSTRAINT "snap_cleanup_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nix_cleanup_queue"
    ADD CONSTRAINT "snap_cleanup_queue_pkey" PRIMARY KEY ("nix_id");



ALTER TABLE ONLY "public"."nixes"
    ADD CONSTRAINT "snaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."upload_logs"
    ADD CONSTRAINT "upload_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_friend_invites_created_by" ON "public"."friend_invites" USING "btree" ("created_by");



CREATE INDEX "idx_friend_invites_expires_at" ON "public"."friend_invites" USING "btree" ("expires_at");



CREATE INDEX "idx_friend_invites_previewed_by" ON "public"."friend_invites" USING "btree" ("previewed_by");



CREATE INDEX "idx_friendships_friend" ON "public"."friendships" USING "btree" ("friend_id");



CREATE INDEX "idx_friendships_user" ON "public"."friendships" USING "btree" ("user_id");



CREATE INDEX "idx_nixes_receiver_created_at" ON "public"."nixes" USING "btree" ("receiver_id", "created_at" DESC);



CREATE INDEX "idx_nixes_sender_created_at" ON "public"."nixes" USING "btree" ("sender_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_nixes_sender_receiver_upload_id_unique" ON "public"."nixes" USING "btree" ("sender_id", "receiver_id", "client_upload_id");



CREATE UNIQUE INDEX "idx_profiles_username_lower_unique" ON "public"."profiles" USING "btree" ("lower"("username")) WHERE ("username" IS NOT NULL);



CREATE INDEX "idx_snap_capture_prefs_owner" ON "public"."nix_capture_prefs" USING "btree" ("owner_user_id");



CREATE INDEX "idx_snap_cleanup_queue_receiver_next_attempt" ON "public"."nix_cleanup_queue" USING "btree" ("receiver_id", "next_attempt_at");



CREATE INDEX "idx_snaps_is_viewed" ON "public"."nixes" USING "btree" ("is_viewed");



CREATE INDEX "idx_snaps_receiver_id" ON "public"."nixes" USING "btree" ("receiver_id");



CREATE INDEX "idx_snaps_sender_id" ON "public"."nixes" USING "btree" ("sender_id");



CREATE INDEX "idx_upload_logs_failure_stage" ON "public"."upload_logs" USING "btree" ("failure_stage") WHERE ("failure_stage" IS NOT NULL);



CREATE INDEX "idx_upload_logs_sender_created_at" ON "public"."upload_logs" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "idx_upload_logs_status_created_at" ON "public"."upload_logs" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_upload_logs_upload_flow_id" ON "public"."upload_logs" USING "btree" ("upload_flow_id") WHERE ("upload_flow_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "prevent_username_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_username_change"();



CREATE OR REPLACE TRIGGER "protect_nix_payload" BEFORE UPDATE ON "public"."nixes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_nix_payload_update"();



ALTER TABLE ONLY "public"."friend_invites"
    ADD CONSTRAINT "friend_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_invites"
    ADD CONSTRAINT "friend_invites_previewed_by_fkey" FOREIGN KEY ("previewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friend_invites"
    ADD CONSTRAINT "friend_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nix_capture_prefs"
    ADD CONSTRAINT "snap_capture_prefs_friend_user_id_fkey" FOREIGN KEY ("friend_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nix_capture_prefs"
    ADD CONSTRAINT "snap_capture_prefs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nix_cleanup_queue"
    ADD CONSTRAINT "snap_cleanup_queue_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nix_cleanup_queue"
    ADD CONSTRAINT "snap_cleanup_queue_snap_id_fkey" FOREIGN KEY ("nix_id") REFERENCES "public"."nixes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nixes"
    ADD CONSTRAINT "snaps_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nixes"
    ADD CONSTRAINT "snaps_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."upload_logs"
    ADD CONSTRAINT "upload_logs_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."upload_logs"
    ADD CONSTRAINT "upload_logs_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE "public"."friend_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_invites_insert" ON "public"."friend_invites" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND ("expires_at" > "now"())));



CREATE POLICY "friend_invites_select" ON "public"."friend_invites" FOR SELECT USING ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = "used_by")));



CREATE POLICY "friend_invites_update" ON "public"."friend_invites" FOR UPDATE USING ((("auth"."uid"() = "used_by") OR ("auth"."role"() = 'service_role'::"text"))) WITH CHECK ((("auth"."uid"() = "used_by") OR ("auth"."role"() = 'service_role'::"text")));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_delete" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friendships_insert" ON "public"."friendships" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("user_id" <> "friend_id") AND (( SELECT "count"(*) AS "count"
   FROM "public"."friendships" "f"
  WHERE (("f"."user_id" = "auth"."uid"()) AND ("f"."created_at" > ("now"() - '01:00:00'::interval)))) < 30)));



CREATE POLICY "friendships_select" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friendships_update" ON "public"."friendships" FOR UPDATE USING (("auth"."uid"() = "friend_id")) WITH CHECK (("auth"."uid"() = "friend_id"));



ALTER TABLE "public"."nix_capture_prefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nix_capture_prefs_delete" ON "public"."nix_capture_prefs" FOR DELETE USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "nix_capture_prefs_insert" ON "public"."nix_capture_prefs" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "nix_capture_prefs_select" ON "public"."nix_capture_prefs" FOR SELECT USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "nix_capture_prefs_update" ON "public"."nix_capture_prefs" FOR UPDATE USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."nix_cleanup_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nix_cleanup_audit_insert" ON "public"."nix_cleanup_audit" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "nix_cleanup_audit_select" ON "public"."nix_cleanup_audit" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."nix_cleanup_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nix_cleanup_queue_delete" ON "public"."nix_cleanup_queue" FOR DELETE USING ((("auth"."uid"() = "receiver_id") OR ("auth"."role"() = 'service_role'::"text")));



CREATE POLICY "nix_cleanup_queue_insert" ON "public"."nix_cleanup_queue" FOR INSERT WITH CHECK (("auth"."uid"() = "receiver_id"));



CREATE POLICY "nix_cleanup_queue_select" ON "public"."nix_cleanup_queue" FOR SELECT USING (("auth"."uid"() = "receiver_id"));



CREATE POLICY "nix_cleanup_queue_update" ON "public"."nix_cleanup_queue" FOR UPDATE USING (("auth"."uid"() = "receiver_id"));



ALTER TABLE "public"."nixes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nixes_insert" ON "public"."nixes" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND "public"."can_send_nix"("sender_id", "receiver_id")));



CREATE POLICY "nixes_select" ON "public"."nixes" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "nixes_update_viewed" ON "public"."nixes" FOR UPDATE USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."upload_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "upload_logs_delete" ON "public"."upload_logs" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "upload_logs_insert" ON "public"."upload_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "upload_logs_select" ON "public"."upload_logs" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_send_nix"("sender" "uuid", "receiver" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_send_nix"("sender" "uuid", "receiver" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."can_send_nix"("sender" "uuid", "receiver" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_friend_invite"("invite_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_friend_invite"("invite_channel" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_friend_invite"("invite_channel" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_my_conversation_with_peer"("peer_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_conversation_with_peer"("peer_profile_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_conversation_with_peer"("peer_profile_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_capture_policy_for_sender"("sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_capture_policy_for_sender"("sender_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_capture_policy_for_sender"("sender_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_profile_by_username"("search_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_profile_by_username"("search_username" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_profile_by_username"("search_username" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_profiles_by_ids"("profile_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_profiles_by_ids"("profile_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_profiles_by_ids"("profile_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_cleanup_audit"("p_nix_id" "uuid", "p_receiver_id" "uuid", "p_media_path" "text", "p_status" "text", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_cleanup_audit"("p_nix_id" "uuid", "p_receiver_id" "uuid", "p_media_path" "text", "p_status" "text", "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_nix_payload_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_nix_payload_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_nix_payload_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_username_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_username_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_username_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_friend_invite"("invite_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_friend_invite"("invite_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."preview_friend_invite"("invite_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."redeem_friend_invite"("invite_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_friend_invite"("invite_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."redeem_friend_invite"("invite_token" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."friend_invites" TO "anon";
GRANT ALL ON TABLE "public"."friend_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_invites" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."nix_capture_prefs" TO "anon";
GRANT ALL ON TABLE "public"."nix_capture_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."nix_capture_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."nix_cleanup_audit" TO "anon";
GRANT ALL ON TABLE "public"."nix_cleanup_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."nix_cleanup_audit" TO "service_role";



GRANT ALL ON TABLE "public"."nix_cleanup_queue" TO "anon";
GRANT ALL ON TABLE "public"."nix_cleanup_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."nix_cleanup_queue" TO "service_role";



GRANT ALL ON TABLE "public"."nixes" TO "anon";
GRANT ALL ON TABLE "public"."nixes" TO "authenticated";
GRANT ALL ON TABLE "public"."nixes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."upload_logs" TO "anon";
GRANT ALL ON TABLE "public"."upload_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."upload_logs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- App-owned objects outside the public schema are intentionally added to the
-- baseline because pg_dump --schema public does not include them.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('media-vault', 'media-vault', FALSE, 419430400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_storage_delete ON storage.objects;
CREATE POLICY avatars_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::UUID = auth.uid()
  );

DROP POLICY IF EXISTS avatars_storage_insert ON storage.objects;
CREATE POLICY avatars_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::UUID = auth.uid()
  );

DROP POLICY IF EXISTS avatars_storage_select ON storage.objects;
CREATE POLICY avatars_storage_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (
      split_part(name, '/', 1)::UUID = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.user_id = auth.uid() AND f.friend_id = split_part(storage.objects.name, '/', 1)::UUID)
            OR (f.friend_id = auth.uid() AND f.user_id = split_part(storage.objects.name, '/', 1)::UUID)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.nixes n
        WHERE (n.sender_id = auth.uid() AND n.receiver_id = split_part(storage.objects.name, '/', 1)::UUID)
           OR (n.receiver_id = auth.uid() AND n.sender_id = split_part(storage.objects.name, '/', 1)::UUID)
      )
      OR EXISTS (
        SELECT 1 FROM public.friend_invites fi
        WHERE fi.created_by = split_part(storage.objects.name, '/', 1)::UUID
          AND fi.previewed_by = auth.uid()
          AND fi.used_at IS NULL
          AND fi.expires_at > NOW()
      )
    )
  );

DROP POLICY IF EXISTS avatars_storage_update ON storage.objects;
CREATE POLICY avatars_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::UUID = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1)::UUID = auth.uid()
  );

DROP POLICY IF EXISTS storage_delete ON storage.objects;
CREATE POLICY storage_delete
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media-vault' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS storage_insert ON storage.objects;
CREATE POLICY storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  );

DROP POLICY IF EXISTS storage_select ON storage.objects;
CREATE POLICY storage_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.nixes n
      WHERE n.media_path = storage.objects.name
        AND (n.sender_id = auth.uid() OR n.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS storage_update ON storage.objects;
CREATE POLICY storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  )
  WITH CHECK (
    bucket_id = 'media-vault'
    AND auth.role() = 'authenticated'
    AND name LIKE ('nixes/' || auth.uid() || '/%')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'nixes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nixes;
  END IF;
END;
$$;

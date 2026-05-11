-- ============================================================
-- NiX — Supabase Social Graph Seed v1.0
-- Cel: min. 10 znajomych i 10 rozmówców na użytkownika
-- Uruchom w Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

-- Wymagania:
-- - docs/supabase_setup.sql musi być uruchomiony wcześniej.
-- - Skrypt jest idempotentny (bezpieczny do wielokrotnego uruchamiania).

-- ------------------------------------------------------------
-- 0) Parametry i dane robocze
-- ------------------------------------------------------------
DO $$
DECLARE
  current_profiles_count INT;
  target_min_users INT := 11;
  users_to_add INT;
  i INT;
  generated_email TEXT;
  generated_username TEXT;
  generated_id UUID;
BEGIN
  SELECT COUNT(*) INTO current_profiles_count FROM public.profiles;
  users_to_add := GREATEST(0, target_min_users - current_profiles_count);

  IF users_to_add > 0 THEN
    RAISE NOTICE 'Dodawanie % technicznych kont seedowych do auth.users + profiles', users_to_add;
  ELSE
    RAISE NOTICE 'Brak potrzeby dodawania kont technicznych (profiles: %)', current_profiles_count;
  END IF;

  -- Tworzymy brakujących użytkowników technicznych.
  -- Uwaga: profiles.id ma FK do auth.users(id), dlatego najpierw auth.users.
  FOR i IN 1..users_to_add LOOP
    generated_email := format('seed_social_%s_%s@nix.local', to_char(NOW(), 'YYYYMMDDHH24MISS'), lpad(i::TEXT, 3, '0'));
    generated_username := format('seed_social_%s', lpad(i::TEXT, 3, '0'));
    generated_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      generated_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      generated_email,
      crypt(gen_random_uuid()::TEXT, gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('seed', true, 'type', 'social_graph'),
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, username)
    VALUES (generated_id, generated_username)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 1) Kanoniczna lista użytkowników i docelowy graf znajomości
--    (regularny ring: offset 1..5 => 10 peerów per user)
-- ------------------------------------------------------------
CREATE TEMP TABLE tmp_seed_users ON COMMIT DROP AS
SELECT
  p.id,
  ROW_NUMBER() OVER (ORDER BY p.created_at, p.id) AS rn
FROM public.profiles p;

CREATE TEMP TABLE tmp_seed_pairs ON COMMIT DROP AS
SELECT
  u1.id AS user_a,
  u2.id AS user_b,
  LEAST(u1.id, u2.id) AS canonical_user_id,
  GREATEST(u1.id, u2.id) AS canonical_friend_id
FROM tmp_seed_users u1
JOIN tmp_seed_users u2
  ON u2.rn > u1.rn
 AND (
   u2.rn - u1.rn BETWEEN 1 AND 5
   OR u1.rn + (SELECT COUNT(*) FROM tmp_seed_users) - u2.rn BETWEEN 1 AND 5
 );

-- ------------------------------------------------------------
-- 2) Friendships (accepted) - idempotentne dopełnianie
-- ------------------------------------------------------------
INSERT INTO public.friendships (user_id, friend_id, status)
SELECT
  sp.canonical_user_id,
  sp.canonical_friend_id,
  'accepted'
FROM tmp_seed_pairs sp
ON CONFLICT (user_id, friend_id)
DO UPDATE SET status = 'accepted';

-- ------------------------------------------------------------
-- 3) Nixes: 1 rekord na parę (daje 10 rozmówców per user)
-- ------------------------------------------------------------
INSERT INTO public.nixes (
  sender_id,
  receiver_id,
  media_path,
  media_type,
  status,
  view_duration_sec,
  client_upload_id
)
SELECT
  sp.canonical_user_id AS sender_id,
  sp.canonical_friend_id AS receiver_id,
  format('nixes/%s/seed/social/%s.jpg', sp.canonical_user_id::TEXT, replace(sp.canonical_friend_id::TEXT, '-', '')) AS media_path,
  'image' AS media_type,
  'sent' AS status,
  5 AS view_duration_sec,
  format('seed-social-%s-%s-v1', replace(sp.canonical_user_id::TEXT, '-', ''), replace(sp.canonical_friend_id::TEXT, '-', '')) AS client_upload_id
FROM tmp_seed_pairs sp
ON CONFLICT (sender_id, receiver_id, client_upload_id) DO NOTHING;

-- ------------------------------------------------------------
-- 4) Walidacja (znajomi + rozmówcy)
-- ------------------------------------------------------------
-- 4.1 Liczba zaakceptowanych znajomych per user
SELECT
  u.id,
  p.username,
  COUNT(*) FILTER (
    WHERE f.status = 'accepted'
      AND (f.user_id = u.id OR f.friend_id = u.id)
  ) AS accepted_friends_count
FROM tmp_seed_users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.friendships f
  ON f.user_id = u.id OR f.friend_id = u.id
GROUP BY u.id, p.username
ORDER BY accepted_friends_count ASC, p.username NULLS LAST, u.id;

-- 4.2 Liczba unikalnych rozmówców per user (na bazie nixes)
WITH user_peers AS (
  SELECT
    s.sender_id AS user_id,
    s.receiver_id AS peer_id
  FROM public.nixes s
  UNION
  SELECT
    s.receiver_id AS user_id,
    s.sender_id AS peer_id
  FROM public.nixes s
)
SELECT
  u.id,
  p.username,
  COUNT(DISTINCT up.peer_id) AS chat_peers_count
FROM tmp_seed_users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN user_peers up ON up.user_id = u.id
GROUP BY u.id, p.username
ORDER BY chat_peers_count ASC, p.username NULLS LAST, u.id;

-- 4.3 Odchylenia od celu (minimum 10/10)
WITH friends_count AS (
  SELECT
    u.id AS user_id,
    COUNT(*) FILTER (
      WHERE f.status = 'accepted'
        AND (f.user_id = u.id OR f.friend_id = u.id)
    ) AS accepted_friends_count
  FROM tmp_seed_users u
  LEFT JOIN public.friendships f
    ON f.user_id = u.id OR f.friend_id = u.id
  GROUP BY u.id
),
chat_peers_count AS (
  SELECT
    u.id AS user_id,
    COUNT(DISTINCT peers.peer_id) AS chat_peers_count
  FROM tmp_seed_users u
  LEFT JOIN (
    SELECT sender_id AS user_id, receiver_id AS peer_id FROM public.nixes
    UNION
    SELECT receiver_id AS user_id, sender_id AS peer_id FROM public.nixes
  ) peers
    ON peers.user_id = u.id
  GROUP BY u.id
)
SELECT
  p.id,
  p.username,
  fc.accepted_friends_count,
  cc.chat_peers_count
FROM public.profiles p
JOIN friends_count fc ON fc.user_id = p.id
JOIN chat_peers_count cc ON cc.user_id = p.id
WHERE fc.accepted_friends_count < 10 OR cc.chat_peers_count < 10
ORDER BY p.username NULLS LAST, p.id;

-- ============================================================
-- GOTOWE ✅
-- ============================================================

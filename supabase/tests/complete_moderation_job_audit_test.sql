-- C3B audit: complete_moderation_job grants + lease semantics (local pgTAP only).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

SELECT is(
  has_function_privilege(
    'anon',
    'public.complete_moderation_job(uuid, text, public.moderation_job_status, text, text, integer, text, text, integer, text, boolean)',
    'EXECUTE'
  ),
  FALSE,
  'anon cannot complete_moderation_job'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.complete_moderation_job(uuid, text, public.moderation_job_status, text, text, integer, text, text, integer, text, boolean)',
    'EXECUTE'
  ),
  FALSE,
  'authenticated cannot complete_moderation_job'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.complete_moderation_job(uuid, text, public.moderation_job_status, text, text, integer, text, text, integer, text, boolean)',
    'EXECUTE'
  ),
  TRUE,
  'service_role can complete_moderation_job'
);

INSERT INTO auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    'c3b10000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'c3b-audit-a@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c3b10000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'c3b-audit-b@example.invalid', 'x', now(),
    '{}', '{}', now(), now()
  );

INSERT INTO public.moderation_text_payloads(id, body)
VALUES
  ('c3b20000-0000-0000-0000-000000000001', 'audit payload 1'),
  ('c3b20000-0000-0000-0000-000000000002', 'audit payload 2'),
  ('c3b20000-0000-0000-0000-000000000003', 'audit payload 3'),
  ('c3b20000-0000-0000-0000-000000000004', 'audit payload 4'),
  ('c3b20000-0000-0000-0000-000000000005', 'audit payload 5');

INSERT INTO public.moderation_jobs(
  id, content_kind, text_payload_id, sender_id, receiver_id,
  status, lease_owner, lease_expires_at, attempt_count
)
VALUES
  (
    'c3b30000-0000-0000-0000-000000000001',
    'text',
    'c3b20000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000002',
    'processing',
    'worker-a',
    NOW() + INTERVAL '10 minutes',
    1
  ),
  (
    'c3b30000-0000-0000-0000-000000000002',
    'text',
    'c3b20000-0000-0000-0000-000000000002',
    'c3b10000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000002',
    'processing',
    'worker-a',
    NOW() + INTERVAL '10 minutes',
    1
  ),
  (
    'c3b30000-0000-0000-0000-000000000003',
    'text',
    'c3b20000-0000-0000-0000-000000000003',
    'c3b10000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000002',
    'processing',
    'worker-a',
    NOW() - INTERVAL '1 minute',
    1
  ),
  (
    'c3b30000-0000-0000-0000-000000000004',
    'text',
    'c3b20000-0000-0000-0000-000000000004',
    'c3b10000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000002',
    'pending',
    NULL,
    NULL,
    0
  ),
  (
    'c3b30000-0000-0000-0000-000000000005',
    'text',
    'c3b20000-0000-0000-0000-000000000005',
    'c3b10000-0000-0000-0000-000000000001',
    'c3b10000-0000-0000-0000-000000000002',
    'approved',
    'worker-hold',
    NOW() + INTERVAL '10 minutes',
    1
  );

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$SELECT public.complete_moderation_job(
    'c3b30000-0000-0000-0000-000000000001'::uuid,
    'worker-a',
    'approved',
    'approved',
    'v1',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )$$,
  'service_role completes claimed processing job'
);

SELECT throws_ok(
  $$SELECT public.complete_moderation_job(
    'c3b30000-0000-0000-0000-000000000002'::uuid,
    'worker-b',
    'approved',
    'approved',
    'v1',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )$$,
  'P0001',
  'LEASE_MISMATCH',
  'wrong lease owner is rejected'
);

SELECT throws_ok(
  $$SELECT public.complete_moderation_job(
    'c3b30000-0000-0000-0000-000000000003'::uuid,
    'worker-a',
    'approved',
    'approved',
    'v1',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )$$,
  'P0001',
  'LEASE_EXPIRED',
  'expired lease is rejected'
);

SELECT throws_ok(
  $$SELECT public.complete_moderation_job(
    'c3b30000-0000-0000-0000-000000000004'::uuid,
    'worker-a',
    'approved',
    'approved',
    'v1',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )$$,
  'P0001',
  'JOB_NOT_CLAIMABLE',
  'pending unclaimed job cannot be completed'
);

SELECT throws_ok(
  $$SELECT public.complete_moderation_job(
    'c3b30000-0000-0000-0000-000000000002'::uuid,
    '',
    'approved',
    'approved',
    'v1',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )$$,
  'P0001',
  'LEASE_OWNER_REQUIRED',
  'empty lease owner is rejected'
);

-- Active recovery lease must not be stolen by a second worker.
SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM public.claim_approved_unmaterialized_moderation_jobs('worker-thief', 5)
    WHERE id = 'c3b30000-0000-0000-0000-000000000005'
  ),
  0,
  'recovery claim skips job with active lease'
);

SELECT is(
  (
    SELECT lease_owner
    FROM public.moderation_jobs
    WHERE id = 'c3b30000-0000-0000-0000-000000000005'
  ),
  'worker-hold',
  'active recovery lease owner unchanged'
);

-- After expiry, recovery claim may take the job.
UPDATE public.moderation_jobs
SET lease_expires_at = NOW() - INTERVAL '1 second'
WHERE id = 'c3b30000-0000-0000-0000-000000000005';

SELECT is(
  (
    SELECT lease_owner
    FROM public.claim_approved_unmaterialized_moderation_jobs('worker-recover', 1)
    WHERE id = 'c3b30000-0000-0000-0000-000000000005'
  ),
  'worker-recover',
  'expired recovery lease can be claimed'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

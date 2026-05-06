-- Dashboard diagnostyczny upload/cleanup (Supabase SQL Editor)

-- 1) Potencjalne duplikaty po idempotency key
select
  sender_id,
  receiver_id,
  client_upload_id,
  count(*) as duplicate_count
from public.snaps
where client_upload_id is not null
group by sender_id, receiver_id, client_upload_id
having count(*) > 1
order by duplicate_count desc;

-- 2) Error budget etapów uploadu (ostatnie 24h)
select
  failure_stage,
  count(*) as failures
from public.upload_logs
where status = 'failed'
  and created_at > now() - interval '24 hours'
group by failure_stage
order by failures desc;

-- 3) Retry rate (ostatnie 24h)
select
  count(*) filter (where retry_count > 0) as retries,
  count(*) as total,
  round(
    (count(*) filter (where retry_count > 0)::numeric / nullif(count(*), 0)::numeric) * 100,
    2
  ) as retry_rate_pct
from public.upload_logs
where created_at > now() - interval '24 hours';

-- 4) Cleanup queue health
select
  count(*) as queued_jobs,
  max(attempt_count) as max_attempt_count,
  min(next_attempt_at) as next_retry_at
from public.snap_cleanup_queue;

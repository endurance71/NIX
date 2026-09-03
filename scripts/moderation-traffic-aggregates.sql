-- C2 traffic forecast input. Returns aggregate counts only; never selects message
-- bodies, storage paths, user IDs, or any other private content/identifier.
WITH text_counts AS (
  SELECT
    count(*) FILTER (WHERE created_at >= now() - interval '30 days')::bigint AS text_30d,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS text_7d
  FROM public.text_messages
),
media_counts AS (
  SELECT
    count(*) FILTER (
      WHERE media_type = 'image' AND created_at >= now() - interval '30 days'
    )::bigint AS images_30d,
    count(*) FILTER (
      WHERE media_type = 'image' AND created_at >= now() - interval '7 days'
    )::bigint AS images_7d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '30 days'
        AND playback_duration_ms <= 15000
    )::bigint AS video_15_30d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '30 days'
        AND playback_duration_ms > 15000 AND playback_duration_ms <= 60000
    )::bigint AS video_60_30d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '30 days'
        AND (playback_duration_ms > 60000 OR playback_duration_ms IS NULL)
    )::bigint AS video_180_30d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '7 days'
        AND playback_duration_ms <= 15000
    )::bigint AS video_15_7d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '7 days'
        AND playback_duration_ms > 15000 AND playback_duration_ms <= 60000
    )::bigint AS video_60_7d,
    count(*) FILTER (
      WHERE media_type = 'video' AND created_at >= now() - interval '7 days'
        AND (playback_duration_ms > 60000 OR playback_duration_ms IS NULL)
    )::bigint AS video_180_7d
  FROM public.media_assets
)
SELECT jsonb_build_object(
  'last30dText', text_30d,
  'last30dUniqueImages', images_30d,
  'last30dVideosByBucket', jsonb_build_object(
    '15', video_15_30d,
    '60', video_60_30d,
    '180', video_180_30d
  ),
  'last7dText', text_7d,
  'last7dUniqueImages', images_7d,
  'last7dVideosByBucket', jsonb_build_object(
    '15', video_15_7d,
    '60', video_60_7d,
    '180', video_180_7d
  )
) AS traffic_inputs
FROM text_counts CROSS JOIN media_counts;

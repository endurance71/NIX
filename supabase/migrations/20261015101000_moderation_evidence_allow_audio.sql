-- Reported voice messages keep their recording as evidence.
-- `report-content` copies the audio of a reported voice message into the private
-- `moderation-evidence` bucket (the message body is only a "🎤 0:12" placeholder and the audio is
-- deleted when the message expires). The bucket accepted images, video and JSON only; allow the
-- AAC/M4A types the `voice-messages` bucket stores. Retention is unchanged (30 days, then the
-- `cleanup-moderation-evidence` job removes the object).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'application/json',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac'
]
WHERE id = 'moderation-evidence';

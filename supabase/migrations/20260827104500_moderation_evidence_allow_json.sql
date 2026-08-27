-- Allow text-report evidence JSON in the private moderation-evidence bucket.
-- The bucket was created for media copies only; P0-2 text reports upload
-- application/json at {reportId}/evidence.json.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'application/json'
]
WHERE id = 'moderation-evidence';

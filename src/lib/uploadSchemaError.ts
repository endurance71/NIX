export function isNonRetryableUploadSchemaError(error: { code: string; message: string }) {
  if (error.code !== 'UNKNOWN') return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('client_upload_id') ||
    (message.includes('no unique or exclusion constraint') && message.includes('on conflict'))
  );
}

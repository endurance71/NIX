import { describe, expect, it } from 'vitest';
import { isNonRetryableUploadSchemaError } from './uploadSchemaError';

describe('isNonRetryableUploadSchemaError', () => {
  it('treats missing ON CONFLICT arbiter errors as non-retryable schema errors', () => {
    expect(
      isNonRetryableUploadSchemaError({
        code: 'UNKNOWN',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      })
    ).toBe(true);
  });

  it('treats missing client_upload_id support as a non-retryable schema error', () => {
    expect(
      isNonRetryableUploadSchemaError({
        code: 'UNKNOWN',
        message: "Could not find the 'client_upload_id' column of 'nixes'",
      })
    ).toBe(true);
  });

  it('does not classify ordinary unknown upload errors as schema errors', () => {
    expect(
      isNonRetryableUploadSchemaError({
        code: 'UNKNOWN',
        message: 'Network request failed',
      })
    ).toBe(false);
  });
});

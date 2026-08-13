import { describe, expect, it } from 'vitest';
import { normalizeMediaDrawingOverlay } from './mediaDrawingOverlay';

describe('normalizeMediaDrawingOverlay', () => {
  it('returns null for missing or empty drawing data', () => {
    expect(normalizeMediaDrawingOverlay(null)).toBeNull();
    expect(normalizeMediaDrawingOverlay({ data: '  ', width: 390, height: 844 })).toBeNull();
  });

  it('returns null for invalid canvas dimensions', () => {
    expect(normalizeMediaDrawingOverlay({ data: 'abc', width: 0, height: 844 })).toBeNull();
    expect(normalizeMediaDrawingOverlay({ data: 'abc', width: 390, height: Number.NaN })).toBeNull();
  });

  it('normalizes a valid drawing', () => {
    expect(
      normalizeMediaDrawingOverlay({ data: '  cGtEcmF3aW5n  ', width: 390, height: 844 })
    ).toEqual({ data: 'cGtEcmF3aW5n', width: 390, height: 844 });
  });
});

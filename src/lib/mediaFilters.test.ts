import { describe, expect, it, vi } from 'vitest';
import {
  IDENTITY_COLOR_MATRIX,
  MEDIA_FILTER_IDS,
  MEDIA_FILTER_LABEL_KEYS,
  applyColorMatrix,
  concatColorMatrices,
  contrastMatrix,
  filterStepForSwipe,
  mediaFilterMatrix,
  nativeFilterMatrix,
  normalizeMediaFilterId,
  saturationMatrix,
  stepMediaFilter,
} from './mediaFilters';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'pl' }] }));

const close = (a: readonly number[], b: readonly number[]) =>
  a.every((value, index) => Math.abs(value - b[index]) < 1e-3);

describe('media filters', () => {
  it('offers 8 filters starting with the original, each with pl/en labels', async () => {
    const { resources } = await import('./i18n');
    expect(MEDIA_FILTER_IDS).toHaveLength(8);
    expect(MEDIA_FILTER_IDS[0]).toBe('original');
    for (const id of MEDIA_FILTER_IDS) {
      const key = MEDIA_FILTER_LABEL_KEYS[id].split('.').pop()!;
      expect(resources.pl.translation.preview.filters).toHaveProperty(key);
      expect(resources.en.translation.preview.filters).toHaveProperty(key);
    }
  });

  it('gives every filter a finite 4x5 matrix that keeps alpha', () => {
    for (const id of MEDIA_FILTER_IDS) {
      const matrix = mediaFilterMatrix(id);
      expect(matrix).toHaveLength(20);
      expect(matrix.every(Number.isFinite)).toBe(true);
      expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    }
    expect(mediaFilterMatrix('original')).toEqual(IDENTITY_COLOR_MATRIX);
  });

  it('sends no matrix for the original so native skips filtering', () => {
    expect(nativeFilterMatrix('original')).toEqual([]);
    expect(nativeFilterMatrix(undefined)).toEqual([]);
    expect(nativeFilterMatrix('noir')).toHaveLength(20);
  });

  it('makes mono and noir grey and keeps vivid more saturated', () => {
    const red: [number, number, number, number] = [0.8, 0.2, 0.1, 1];
    for (const id of ['mono', 'noir'] as const) {
      const [r, g, b, a] = applyColorMatrix(mediaFilterMatrix(id), red);
      expect(r).toBeCloseTo(g, 5);
      expect(g).toBeCloseTo(b, 5);
      expect(a).toBe(1);
    }
    const [vr, vg] = applyColorMatrix(mediaFilterMatrix('vivid'), red);
    expect(vr - vg).toBeGreaterThan(0.6);
  });

  it('warms and cools in the expected direction and lifts blacks on fade', () => {
    const grey: [number, number, number, number] = [0.5, 0.5, 0.5, 1];
    const warm = applyColorMatrix(mediaFilterMatrix('warm'), grey);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const cool = applyColorMatrix(mediaFilterMatrix('cool'), grey);
    expect(cool[2]).toBeGreaterThan(cool[0]);
    const black = applyColorMatrix(mediaFilterMatrix('fade'), [0, 0, 0, 1]);
    expect(black[0]).toBeGreaterThan(0.05);
  });

  it('clamps like the native CIColorClamp', () => {
    expect(applyColorMatrix(contrastMatrix(3), [1, 0, 1, 1])).toEqual([1, 0, 1, 1]);
  });

  it('composes matrices left after right', () => {
    const composed = concatColorMatrices(saturationMatrix(0), saturationMatrix(1));
    expect(close(composed, saturationMatrix(0))).toBe(true);
    const pixel: [number, number, number, number] = [0.3, 0.6, 0.2, 1];
    const twoStep = applyColorMatrix(contrastMatrix(1.2), applyColorMatrix(saturationMatrix(1.3), pixel));
    const oneStep = applyColorMatrix(concatColorMatrices(contrastMatrix(1.2), saturationMatrix(1.3)), pixel);
    expect(close(twoStep, oneStep)).toBe(true);
  });

  it('steps with wrap-around and normalises unknown ids', () => {
    expect(stepMediaFilter('original', 1)).toBe('vivid');
    expect(stepMediaFilter('original', -1)).toBe('fade');
    expect(stepMediaFilter('fade', 1)).toBe('original');
    expect(normalizeMediaFilterId('sepia')).toBe('original');
    expect(normalizeMediaFilterId('retro')).toBe('retro');
  });

  it('maps swipes: left = next, right = previous, short and slow = none', () => {
    expect(filterStepForSwipe(-80, 0)).toBe(1);
    expect(filterStepForSwipe(80, 0)).toBe(-1);
    expect(filterStepForSwipe(-20, -900)).toBe(1);
    expect(filterStepForSwipe(20, 100)).toBe(0);
  });
});

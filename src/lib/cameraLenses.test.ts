import { describe, expect, it } from 'vitest';
import {
  buildLensSwitcherOptions,
  classifyCameraLens,
  defaultLensOption,
  FALLBACK_WIDE_2X_ZOOM,
  lensOptionsFromNativePresets,
  shouldShowLensSwitcher,
} from './cameraLenses';

describe('classifyCameraLens', () => {
  it('classifies English physical lenses', () => {
    expect(classifyCameraLens('Back Ultra Wide Camera')).toBe('ultraWide');
    expect(classifyCameraLens('Back Camera')).toBe('wide');
    expect(classifyCameraLens('Back Telephoto Camera')).toBe('telephoto');
  });

  it('classifies Polish physical lenses', () => {
    expect(classifyCameraLens('Tylny obiektyw ultraszerokokątny')).toBe('ultraWide');
    expect(classifyCameraLens('Tylny aparat')).toBe('wide');
    expect(classifyCameraLens('Tylny teleobiektyw')).toBe('telephoto');
    expect(classifyCameraLens('Tylny aparat teleobiektywowy')).toBe('telephoto');
  });

  it('excludes virtual multi-camera and depth devices', () => {
    expect(classifyCameraLens('Back Dual Camera')).toBe('virtual');
    expect(classifyCameraLens('Back Dual Wide Camera')).toBe('virtual');
    expect(classifyCameraLens('Back Triple Camera')).toBe('virtual');
    expect(classifyCameraLens('Back LiDAR Depth Camera')).toBe('virtual');
    expect(classifyCameraLens('Front TrueDepth Camera')).toBe('virtual');
  });

  it('returns unknown for empty or unrelated names', () => {
    expect(classifyCameraLens('')).toBe('unknown');
    expect(classifyCameraLens('   ')).toBe('unknown');
    expect(classifyCameraLens('Microphone')).toBe('unknown');
  });
});

describe('buildLensSwitcherOptions', () => {
  it('adds synthetic 2× crop between wide and tele', () => {
    const options = buildLensSwitcherOptions([
      'Back Triple Camera',
      'Back Telephoto Camera',
      'Back Ultra Wide Camera',
      'Back Dual Camera',
      'Back Camera',
    ]);

    expect(options.map((o) => o.id)).toEqual(['0.5', '1x', '2x', 'tele']);
    expect(options.map((o) => o.kind)).toEqual(['ultraWide', 'wide', 'wideCrop2x', 'telephoto']);
    expect(options.find((o) => o.id === '2x')?.selectedLensValue).toBe('Back Camera');
    expect(options.find((o) => o.id === '2x')?.zoom).toBeCloseTo(FALLBACK_WIDE_2X_ZOOM);
    expect(options.find((o) => o.id === 'tele')?.zoom).toBe(0);
  });

  it('handles Polish localized names and excludes podwójny/potrójny', () => {
    const options = buildLensSwitcherOptions([
      'Tylny teleobiektyw',
      'Podwójny tylny aparat',
      'Potrójny tylny aparat',
      'Tylny aparat',
      'Tylny obiektyw ultraszerokokątny',
    ]);

    expect(options.map((o) => o.kind)).toEqual(['ultraWide', 'wide', 'wideCrop2x', 'telephoto']);
  });

  it('adds 2× when ultra+wide without tele', () => {
    const options = buildLensSwitcherOptions(['Back Ultra Wide Camera', 'Back Camera']);
    expect(options.map((o) => o.id)).toEqual(['0.5', '1x', '2x']);
  });
});

describe('lensOptionsFromNativePresets', () => {
  it('maps native presets including tele display factor and 2× zoom', () => {
    const options = lensOptionsFromNativePresets([
      {
        id: '0.5',
        kind: 'ultraWide',
        label: '0,5',
        localizedName: 'Tylny ultraszerokokątny',
        zoom: 0,
        displayFactor: 0.5,
      },
      {
        id: '1x',
        kind: 'wide',
        label: '1×',
        localizedName: 'Tylny aparat',
        zoom: 0,
        displayFactor: 1,
      },
      {
        id: '2x',
        kind: 'wideCrop2x',
        label: '2',
        localizedName: 'Tylny aparat',
        zoom: 0.22,
        displayFactor: 2,
      },
      {
        id: 'tele',
        kind: 'telephoto',
        label: '5',
        localizedName: 'Tylny teleobiektyw',
        zoom: 0,
        displayFactor: 5,
      },
    ]);

    expect(options.map((o) => o.label)).toEqual(['0,5', '1×', '2', '5']);
    expect(options.find((o) => o.id === '2x')?.zoom).toBe(0.22);
  });
});

describe('defaultLensOption', () => {
  it('prefers 1x when present', () => {
    const options = buildLensSwitcherOptions(['Back Ultra Wide Camera', 'Back Camera']);
    expect(defaultLensOption(options)?.id).toBe('1x');
  });

  it('falls back to first option when wide is missing', () => {
    const options = buildLensSwitcherOptions(['Back Ultra Wide Camera']);
    expect(defaultLensOption(options)?.kind).toBe('ultraWide');
  });

  it('returns null for empty list', () => {
    expect(defaultLensOption([])).toBeNull();
  });
});

describe('shouldShowLensSwitcher', () => {
  it('shows only for rear camera with at least two options', () => {
    const two = buildLensSwitcherOptions(['Back Ultra Wide Camera', 'Back Camera']);
    const one = buildLensSwitcherOptions(['Back Camera']);

    expect(shouldShowLensSwitcher('back', two)).toBe(true);
    expect(shouldShowLensSwitcher('back', one)).toBe(false);
    expect(shouldShowLensSwitcher('front', two)).toBe(false);
  });
});

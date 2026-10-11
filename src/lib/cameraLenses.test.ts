import { describe, expect, it } from 'vitest';
import {
  buildLensSwitcherOptions,
  classifyCameraLens,
  defaultLensOption,
  effectiveZoomFactor,
  estimateMaxZoomFactor,
  FALLBACK_WIDE_2X_ZOOM,
  formatZoomFactorLabel,
  isZoomedAwayFromPreset,
  type LensOption,
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

describe('zoom factor label', () => {
  const wide: LensOption = { id: '1x', kind: 'wide', label: '1×', selectedLensValue: 'Back Camera', zoom: 0, displayFactor: 1 };
  const crop: LensOption = {
    id: '2x',
    kind: 'wideCrop2x',
    label: '2',
    selectedLensValue: 'Back Camera',
    zoom: Math.log(2) / Math.log(64),
    displayFactor: 2,
  };
  const ultra: LensOption = { id: '0.5', kind: 'ultraWide', label: '0,5', selectedLensValue: 'Ultra', zoom: 0, displayFactor: 0.5 };
  const options = [ultra, wide, crop];

  it('reads the max zoom back from the 2× preset', () => {
    expect(estimateMaxZoomFactor(options)).toBeCloseTo(64, 5);
    expect(estimateMaxZoomFactor([wide])).toBe(16);
  });

  it('combines the lens factor with the pinch zoom', () => {
    expect(effectiveZoomFactor(wide, 0, options)).toBe(1);
    expect(effectiveZoomFactor(crop, crop.zoom, options)).toBeCloseTo(2, 5);
    expect(effectiveZoomFactor(ultra, 0, options)).toBe(0.5);
    expect(effectiveZoomFactor(wide, 0.5, options)).toBeCloseTo(8, 5);
  });

  it('only reports a pinch away from the preset', () => {
    expect(isZoomedAwayFromPreset(wide, 0, options)).toBe(false);
    expect(isZoomedAwayFromPreset(crop, crop.zoom, options)).toBe(false);
    expect(isZoomedAwayFromPreset(wide, 0.1, options)).toBe(true);
  });

  it('formats like the Camera app', () => {
    expect(formatZoomFactorLabel(1.62, 'en')).toBe('1.6×');
    expect(formatZoomFactorLabel(1.62, 'pl')).toBe('1,6×');
    expect(formatZoomFactorLabel(2.01, 'en')).toBe('2×');
    expect(formatZoomFactorLabel(12.4, 'en')).toBe('12×');
  });
});

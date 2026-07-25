import type { NativeBackLensPreset } from '../../modules/nix-camera-torch';

export type CameraLensKind = 'ultraWide' | 'wide' | 'telephoto' | 'virtual' | 'unknown';

export type LensSwitcherKind = 'ultraWide' | 'wide' | 'wideCrop2x' | 'telephoto';

export type LensOption = {
  id: string;
  kind: LensSwitcherKind;
  label: string;
  /** Pass-through value for CameraView `selectedLens` (native matches localizedName). */
  selectedLensValue: string;
  /** expo-camera normalized zoom 0–1 (non-zero for wide 2× crop). */
  zoom: number;
  displayFactor: number;
};

const PHYSICAL_KIND_ORDER: Array<'ultraWide' | 'wide' | 'telephoto'> = [
  'ultraWide',
  'wide',
  'telephoto',
];

function normalizeLensName(localizedName: string): string {
  return localizedName.trim().toLowerCase();
}

function formatLensLabel(factor: number): string {
  if (Math.abs(factor - 1) < 0.05) return '1×';
  if (factor < 1) {
    return factor.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (Math.abs(factor - Math.round(factor)) < 0.08) {
    return String(Math.round(factor));
  }
  return factor.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * Classify an expo-camera lens localizedName (language-dependent) into a physical/virtual kind.
 */
export function classifyCameraLens(localizedName: string): CameraLensKind {
  const name = normalizeLensName(localizedName);
  if (!name) return 'unknown';

  if (
    name.includes('dual') ||
    name.includes('triple') ||
    name.includes('podwójny') ||
    name.includes('podwojny') ||
    name.includes('potrójny') ||
    name.includes('potrojny') ||
    name.includes('lidar') ||
    name.includes('truedepth') ||
    name.includes('true depth')
  ) {
    return 'virtual';
  }

  if (
    name.includes('ultraszeroko') ||
    name.includes('ultra wide') ||
    name.includes('ultrawide') ||
    name.includes('ultra-wide') ||
    /\bultra\b/.test(name)
  ) {
    return 'ultraWide';
  }

  if (
    name.includes('teleobiektyw') ||
    name.includes('telephoto') ||
    name.includes('teleobiektywowy') ||
    /\btele\b/.test(name)
  ) {
    return 'telephoto';
  }

  if (
    name.includes('back') ||
    name.includes('rear') ||
    name.includes('front') ||
    name.includes('tylny') ||
    name.includes('przedni') ||
    name.includes('wide') ||
    name.includes('szeroko') ||
    name.includes('camera') ||
    name.includes('aparat') ||
    name.includes('obiektyw')
  ) {
    return 'wide';
  }

  return 'unknown';
}

/** Approximate expo zoom for 2× when native maxZoom is unknown (~max 16×). */
export const FALLBACK_WIDE_2X_ZOOM = Math.log(2) / Math.log(16);

export function lensOptionsFromNativePresets(presets: NativeBackLensPreset[]): LensOption[] {
  const allowed = new Set<LensSwitcherKind>(['ultraWide', 'wide', 'wideCrop2x', 'telephoto']);

  return presets.flatMap((preset) => {
    if (!allowed.has(preset.kind as LensSwitcherKind)) return [];
    return [
      {
        id: preset.id,
        kind: preset.kind as LensSwitcherKind,
        label: preset.label,
        selectedLensValue: preset.localizedName,
        zoom: typeof preset.zoom === 'number' && Number.isFinite(preset.zoom) ? preset.zoom : 0,
        displayFactor: preset.displayFactor,
      },
    ];
  });
}

/**
 * Fallback when native presets are unavailable: physical lenses from localizedName + synthetic 2×.
 */
export function buildLensSwitcherOptions(lenses: string[]): LensOption[] {
  const byKind = new Map<'ultraWide' | 'wide' | 'telephoto', { name: string }>();

  for (const localizedName of lenses) {
    const kind = classifyCameraLens(localizedName);
    if (kind === 'virtual' || kind === 'unknown') continue;
    if (byKind.has(kind)) continue;
    byKind.set(kind, { name: localizedName });
  }

  const options: LensOption[] = [];

  for (const kind of PHYSICAL_KIND_ORDER) {
    const entry = byKind.get(kind);
    if (!entry) continue;

    if (kind === 'ultraWide') {
      options.push({
        id: '0.5',
        kind: 'ultraWide',
        label: formatLensLabel(0.5),
        selectedLensValue: entry.name,
        zoom: 0,
        displayFactor: 0.5,
      });
      continue;
    }

    if (kind === 'wide') {
      options.push({
        id: '1x',
        kind: 'wide',
        label: formatLensLabel(1),
        selectedLensValue: entry.name,
        zoom: 0,
        displayFactor: 1,
      });
      continue;
    }

    options.push({
      id: 'tele',
      kind: 'telephoto',
      label: formatLensLabel(2),
      selectedLensValue: entry.name,
      zoom: 0,
      displayFactor: 2,
    });
  }

  const wide = byKind.get('wide');
  const hasUltra = byKind.has('ultraWide');
  const hasTele = byKind.has('telephoto');
  if (wide && (hasUltra || hasTele)) {
    const teleIndex = options.findIndex((option) => option.kind === 'telephoto');
    const crop: LensOption = {
      id: '2x',
      kind: 'wideCrop2x',
      label: formatLensLabel(2),
      selectedLensValue: wide.name,
      zoom: FALLBACK_WIDE_2X_ZOOM,
      displayFactor: 2,
    };
    if (teleIndex >= 0) {
      options.splice(teleIndex, 0, crop);
    } else {
      options.push(crop);
    }
  }

  return options;
}

export function defaultLensOption(options: LensOption[]): LensOption | null {
  if (options.length === 0) return null;
  return options.find((option) => option.id === '1x' || option.kind === 'wide') ?? options[0] ?? null;
}

export function findLensOptionById(options: LensOption[], id: string | null): LensOption | null {
  if (id == null) return null;
  return options.find((option) => option.id === id) ?? null;
}

/** Chip row is shown only for rear camera with at least two switcher options. */
export function shouldShowLensSwitcher(facing: 'back' | 'front', options: LensOption[]): boolean {
  return facing === 'back' && options.length >= 2;
}

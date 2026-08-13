import { Platform } from 'react-native';
import type { MediaTextFontDesign } from '../types/mediaTextOverlay';

export const MEDIA_TEXT_FONT_DESIGNS: readonly MediaTextFontDesign[] = [
  'system',
  'serif',
  'rounded',
] as const;

export const MEDIA_TEXT_FONT_DESIGN_LABEL_KEYS = {
  system: 'fontDesignSystem',
  serif: 'fontDesignSerif',
  rounded: 'fontDesignRounded',
} as const satisfies Record<MediaTextFontDesign, string>;

/**
 * Preview RN fontFamily. Native bake uses UIFontDescriptor.SystemDesign
 * (default / serif / rounded); monospace still wins via Menlo / monospacedSystemFont.
 */
export function resolveMediaTextFontFamily(opts: {
  monospace?: boolean;
  fontDesign?: MediaTextFontDesign;
}): string | undefined {
  if (opts.monospace) {
    return Platform.select({ ios: 'Menlo', default: 'monospace' });
  }
  switch (opts.fontDesign) {
    case 'serif':
      return Platform.select({ ios: 'Georgia', default: 'serif' });
    case 'rounded':
      // Soft geometric stand-in; bake uses SF Rounded.
      return Platform.select({ ios: 'Avenir Next', default: undefined });
    default:
      return undefined;
  }
}

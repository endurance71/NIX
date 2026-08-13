import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  TRANSPARENT_MEDIA_TEXT_BAR_COLOR,
} from '../types/mediaTextOverlay';

export type MediaTextPaletteSwatch = {
  id: string;
  /** i18n key under preview.colors.* */
  labelKey: string;
  color: string;
};

/** Text color presets (Apple Notes–style named list). */
export const MEDIA_TEXT_COLOR_SWATCHES: MediaTextPaletteSwatch[] = [
  { id: 'white', labelKey: 'white', color: '#FFFFFF' },
  { id: 'black', labelKey: 'black', color: DEFAULT_MEDIA_TEXT_COLOR },
  { id: 'yellow', labelKey: 'yellow', color: '#FFCC00' },
  { id: 'orange', labelKey: 'orange', color: '#FF9500' },
  { id: 'pink', labelKey: 'pink', color: '#FF2D55' },
  { id: 'purple', labelKey: 'purple', color: '#AF52DE' },
  { id: 'blue', labelKey: 'blue', color: '#007AFF' },
  { id: 'mint', labelKey: 'mint', color: '#00C7BE' },
];

/** Caption bar fill presets. Default keeps Liquid Glass in preview. */
export const MEDIA_TEXT_BAR_SWATCHES: MediaTextPaletteSwatch[] = [
  { id: 'default', labelKey: 'barDefault', color: DEFAULT_MEDIA_TEXT_BAR_COLOR },
  { id: 'black', labelKey: 'barBlack', color: '#000000E6' },
  { id: 'white', labelKey: 'barWhite', color: '#FFFFFF8C' },
  { id: 'clear', labelKey: 'barClear', color: TRANSPARENT_MEDIA_TEXT_BAR_COLOR },
  { id: 'blue', labelKey: 'blue', color: '#007AFFCC' },
  { id: 'purple', labelKey: 'purple', color: '#AF52DECC' },
  { id: 'pink', labelKey: 'pink', color: '#FF2D55CC' },
  { id: 'orange', labelKey: 'orange', color: '#FF9500CC' },
];

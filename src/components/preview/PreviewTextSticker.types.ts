import type { StyleProp, ViewStyle } from 'react-native';
import type { PreviewTextStylePatch } from '../../hooks/usePreviewTextOverlay';
import type {
  MediaTextAlign,
  MediaTextFontDesign,
  MediaTextPreset,
  MediaTextVariant,
} from '../../types/mediaTextOverlay';

export type PreviewTextStickerMode = 'display' | 'editing';

export type PreviewTextStickerProps = {
  mode: PreviewTextStickerMode;
  /** `bar`: full-width caption strip (no format options). Defaults to the sticker. */
  variant?: MediaTextVariant;
  /** Offers the bar / sticker switch while editing (only when the binary bakes the bar). */
  onChangeVariant?: (variant: MediaTextVariant) => void;
  text: string;
  fontSize: number;
  textColor?: string;
  barColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  fontDesign?: MediaTextFontDesign;
  preset?: MediaTextPreset;
  align?: MediaTextAlign;
  topPx: number;
  minTopPx: number;
  maxTopPx: number;
  onTopPxChange: (topPx: number) => void;
  onChangeText: (text: string) => void;
  onChangeStyle?: (patch: PreviewTextStylePatch) => void;
  onPressDisplay: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
  exiting?: boolean;
  onExitComplete?: () => void;
  /** Reports the caption bar height (the bake centres the caption on its `y`). */
  onBarHeightChange?: (height: number) => void;
  /** Scale-in when mounting committed sticker in display mode. Skip on "Add text". */
  animateEnter?: boolean;
  style?: StyleProp<ViewStyle>;
};

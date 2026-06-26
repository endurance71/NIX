import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NATIVE_TAB_BAR_CAMERA_OFFSET,
  SHEET_BOTTOM_MIN_PADDING,
  SHEET_TOP_PADDING,
  type ScreenInsetPolicy,
} from '../theme/safeArea';

export type ScreenInsetsResult = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Padding/margin before scrollable content starts. */
  topContentInset: number;
  /** Padding after scrollable content ends. */
  bottomContentInset: number;
};

export function useScreenInsets(policy: ScreenInsetPolicy): ScreenInsetsResult {
  const insets = useSafeAreaInsets();

  switch (policy) {
    case 'fullscreen':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: insets.top,
        bottomContentInset: insets.bottom,
      };

    case 'stackHeader':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: 0,
        bottomContentInset: insets.bottom,
      };

    case 'tabStackList':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: 0,
        bottomContentInset: insets.bottom,
      };

    case 'cameraTab':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: insets.top,
        bottomContentInset: insets.bottom + NATIVE_TAB_BAR_CAMERA_OFFSET,
      };

    case 'sheet':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: SHEET_TOP_PADDING,
        bottomContentInset: Math.max(insets.bottom, SHEET_BOTTOM_MIN_PADDING),
      };

    case 'mediaChrome':
      return {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        topContentInset: insets.top,
        bottomContentInset: insets.bottom,
      };

    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

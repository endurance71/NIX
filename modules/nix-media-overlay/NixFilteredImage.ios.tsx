import type { ComponentType } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

type NativeFilteredImageProps = ViewProps & {
  uri: string;
  filterMatrix: number[];
  contentFit: 'cover' | 'contain';
};

// Created lazily by React Native (view config is looked up on first render), so importing this
// file on a binary without the view is harmless as long as it is never mounted there.
const NativeFilteredImage = requireNativeViewManager<NativeFilteredImageProps>(
  'NixMediaOverlay',
  'NixFilteredImageView'
) as ComponentType<NativeFilteredImageProps>;

export type NixFilteredImageProps = {
  uri: string;
  /** 4×5 colour matrix from `nativeFilterMatrix`; empty shows nothing (transparent). */
  filterMatrix: number[];
  contentFit: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
};

/**
 * Photo rendered through the same Core Image colour matrix the native bake applies, so the
 * preview matches the sent file. Crossfades between filters natively. Only mount when
 * `supportsMediaFiltersAndStickers()` is true (the view is missing on older binaries).
 */
export default function NixFilteredImage({ uri, filterMatrix, contentFit, style }: NixFilteredImageProps) {
  return (
    <NativeFilteredImage
      uri={uri}
      filterMatrix={filterMatrix}
      contentFit={contentFit}
      style={style}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

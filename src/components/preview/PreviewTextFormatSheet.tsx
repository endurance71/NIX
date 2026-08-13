import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Button,
  Host,
  HStack,
  Image as SwiftImage,
  Label,
  Menu,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { AppBottomSheet } from '../ui/app-bottom-sheet';
import { AppIcon } from '../ui/app-icon';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { duration, useMotionEnabled } from '../../theme/motion';
import { SHEET_TOP_PADDING } from '../../theme/safeArea';
import { typography } from '../../theme/typography';
import { tap } from '../../lib/haptics';
import {
  MEDIA_TEXT_BAR_SWATCHES,
  MEDIA_TEXT_COLOR_SWATCHES,
  type MediaTextPaletteSwatch,
} from '../../theme/mediaTextOverlayPalettes';
import { MEDIA_TEXT_PRESETS, applyMediaTextPreset } from '../../theme/mediaTextOverlayPresets';
import {
  MEDIA_TEXT_FONT_DESIGNS,
  MEDIA_TEXT_FONT_DESIGN_LABEL_KEYS,
  resolveMediaTextFontFamily,
} from '../../theme/mediaTextOverlayFonts';
import {
  TRANSPARENT_MEDIA_TEXT_BAR_COLOR,
  type MediaTextAlign,
  type MediaTextFontDesign,
  type MediaTextOverlayStyle,
  type MediaTextPreset,
} from '../../types/mediaTextOverlay';
import type { PreviewTextStylePatch } from '../../hooks/usePreviewTextOverlay';

/** Capsule fill — system gray pills. */
const NOTES_CAPSULE_LIGHT = 'rgba(120,120,128,0.16)';
const NOTES_CAPSULE_DARK = 'rgba(120,120,128,0.32)';
const NOTES_DIVIDER_LIGHT = 'rgba(60,60,67,0.29)';
const NOTES_DIVIDER_DARK = 'rgba(84,84,88,0.65)';
const CONTROL_RADIUS = 18;
const IOS_SELECTION_SLIDE_TIMING = {
  duration: duration.medium,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
} as const;

type SegmentPosition = 'first' | 'middle' | 'last' | 'only';
type PresetChipLayout = { x: number; width: number };
type PresetChipLayoutMap = Partial<Record<MediaTextPreset, PresetChipLayout>>;

type PreviewTextFormatSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  style: MediaTextOverlayStyle;
  onChangeStyle: (patch: PreviewTextStylePatch) => void;
  /** Measured content height — used to park the text bar above the sheet. */
  onContentHeightChange?: (height: number) => void;
};

/** Opaque display color for menu tint (8-digit hex → RGB; clear → gray). */
function menuSwatchTint(color: string): string {
  const upper = color.toUpperCase();
  if (upper === TRANSPARENT_MEDIA_TEXT_BAR_COLOR || upper === '#00000000') {
    return '#8E8E93';
  }
  if (upper.length === 9) return upper.slice(0, 7);
  return upper;
}

function CapsuleSegment({
  selected,
  onPress,
  accessibilityLabel,
  children,
  showDivider,
  dividerColor,
  accentColor,
  position,
  renderSelectedBackground = true,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  showDivider?: boolean;
  dividerColor: string;
  accentColor: string;
  position: SegmentPosition;
  renderSelectedBackground?: boolean;
}) {
  return (
    <>
      {showDivider ? <View style={[styles.divider, { backgroundColor: dividerColor }]} /> : null}
      <Pressable
        onPress={() => {
          tap('light');
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.segment,
          selected && renderSelectedBackground ? { backgroundColor: accentColor } : null,
          selected && renderSelectedBackground ? segmentSelectedRadius(position) : null,
        ]}>
        {children}
      </Pressable>
    </>
  );
}

function SlidingSegmentHighlight({
  width,
  selectedIndex,
  segmentCount,
  accentColor,
}: {
  width: number;
  selectedIndex: number;
  segmentCount: number;
  accentColor: string;
}) {
  const motionEnabled = useMotionEnabled();
  const progress = useSharedValue(Math.max(selectedIndex, 0));
  const opacity = useSharedValue(selectedIndex >= 0 && width > 0 ? 1 : 0);

  useEffect(() => {
    const targetIndex = Math.max(selectedIndex, 0);
    const targetOpacity = selectedIndex >= 0 && width > 0 ? 1 : 0;

    progress.set(motionEnabled ? withTiming(targetIndex, IOS_SELECTION_SLIDE_TIMING) : targetIndex);
    opacity.set(
      motionEnabled
        ? withTiming(targetOpacity, {
            duration: duration.fast,
            easing: Easing.out(Easing.cubic),
          })
        : targetOpacity
    );
  }, [motionEnabled, opacity, progress, selectedIndex, width]);

  const animatedStyle = useAnimatedStyle(() => {
    const segmentWidth = segmentCount > 0 ? width / segmentCount : 0;
    return {
      opacity: opacity.get(),
      width: segmentWidth,
      transform: [{ translateX: progress.get() * segmentWidth }],
    };
  }, [segmentCount, width]);

  if (width <= 0 || segmentCount <= 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.segmentSlideHighlight,
        { backgroundColor: accentColor },
        segmentSelectedRadius(segmentPosition(Math.max(selectedIndex, 0), segmentCount)),
        animatedStyle,
      ]}
    />
  );
}

function SlidingPresetHighlight({
  layout,
  accentColor,
}: {
  layout?: PresetChipLayout;
  accentColor: string;
}) {
  const motionEnabled = useMotionEnabled();
  const x = useSharedValue(layout?.x ?? 0);
  const width = useSharedValue(layout?.width ?? 0);
  const opacity = useSharedValue(layout ? 1 : 0);

  useEffect(() => {
    const nextX = layout?.x ?? 0;
    const nextWidth = layout?.width ?? 0;
    const nextOpacity = layout ? 1 : 0;

    x.set(motionEnabled ? withTiming(nextX, IOS_SELECTION_SLIDE_TIMING) : nextX);
    width.set(motionEnabled ? withTiming(nextWidth, IOS_SELECTION_SLIDE_TIMING) : nextWidth);
    opacity.set(
      motionEnabled
        ? withTiming(nextOpacity, {
            duration: duration.fast,
            easing: Easing.out(Easing.cubic),
          })
        : nextOpacity
    );
  }, [layout, motionEnabled, opacity, width, x]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    width: width.get(),
    transform: [{ translateX: x.get() }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.presetSlideHighlight, { backgroundColor: accentColor }, animatedStyle]}
    />
  );
}

function segmentPosition(index: number, count: number): SegmentPosition {
  if (count <= 1) return 'only';
  if (index === 0) return 'first';
  if (index === count - 1) return 'last';
  return 'middle';
}

function segmentSelectedRadius(position: SegmentPosition) {
  switch (position) {
    case 'first':
      return styles.segmentSelectedFirst;
    case 'last':
      return styles.segmentSelectedLast;
    case 'only':
      return styles.segmentSelectedOnly;
    default:
      return styles.segmentSelectedMiddle;
  }
}

function ColorMenuChip({
  accessibilityLabel,
  iconSystemName,
  selectedColor,
  swatches,
  onSelect,
  t,
  labelColor,
}: {
  accessibilityLabel: string;
  iconSystemName: SFSymbol;
  selectedColor: string;
  swatches: MediaTextPaletteSwatch[];
  onSelect: (color: string) => void;
  t: (key: string) => string;
  labelColor: string;
}) {
  const selectedUpper = selectedColor.toUpperCase();
  const chipTint = menuSwatchTint(selectedColor);
  const chipIsClear =
    selectedColor.toUpperCase() === TRANSPARENT_MEDIA_TEXT_BAR_COLOR ||
    selectedColor.toUpperCase() === '#00000000';

  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.colorHit}>
        <AppIcon name="paintpalette" size={APP_ICON_SIZE.md} color={labelColor} />
      </View>
    );
  }

  return (
    <Host matchContents>
      <Menu
        modifiers={[buttonStyle('plain'), swiftAccessibilityLabel(accessibilityLabel)]}
        label={
        <HStack spacing={8} alignment="center">
          <SwiftImage systemName={iconSystemName} size={APP_ICON_SIZE.lg} color={labelColor} />
          <SwiftImage
            systemName={(chipIsClear ? 'circle.slash' : 'circle.fill') as SFSymbol}
            size={18}
            color={chipIsClear ? labelColor : chipTint}
          />
        </HStack>
        }>
        {swatches.map((swatch) => {
          const isSelected = selectedUpper === swatch.color.toUpperCase();
          const swatchTint = menuSwatchTint(swatch.color);
          const isClear =
            swatch.color.toUpperCase() === TRANSPARENT_MEDIA_TEXT_BAR_COLOR ||
            swatch.color.toUpperCase() === '#00000000';
          return (
            <Button
              key={swatch.id}
              onPress={() => {
                tap('light');
                onSelect(swatch.color);
              }}
              modifiers={[tint(swatchTint)]}>
              <Label
                title={t(`preview.colors.${swatch.labelKey}`)}
                systemImage={
                  (isSelected ? 'checkmark' : isClear ? 'circle.slash' : 'circle.fill') as SFSymbol
                }
                modifiers={[foregroundStyle(swatchTint), tint(swatchTint)]}
              />
            </Button>
          );
        })}
      </Menu>
    </Host>
  );
}

/**
 * Format panel: native AppBottomSheet + capsules + Menu color popups.
 * Notes-style controls with system fills and compact rows.
 */
export function PreviewTextFormatSheet({
  isPresented,
  onDismiss,
  style,
  onChangeStyle,
  onContentHeightChange,
}: PreviewTextFormatSheetProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const capsule = isDark ? NOTES_CAPSULE_DARK : NOTES_CAPSULE_LIGHT;
  const selectedCapsule = colors.accent;
  const divider = isDark ? NOTES_DIVIDER_DARK : NOTES_DIVIDER_LIGHT;
  const ink = colors.label;
  const selectedInk = '#FFFFFF';
  const [presetLayouts, setPresetLayouts] = useState<PresetChipLayoutMap>({});
  const [alignCapsuleWidth, setAlignCapsuleWidth] = useState(0);
  const [fontCapsuleWidth, setFontCapsuleWidth] = useState(0);
  const alignOptions = [
    ['left', 'textAlignLeft', 'preview.alignLeft'] as const,
    ['center', 'textAlignCenter', 'preview.alignCenter'] as const,
    ['right', 'textAlignRight', 'preview.alignRight'] as const,
  ];
  const selectedAlignIndex = alignOptions.findIndex(([align]) => style.align === align);
  const selectedFontIndex = MEDIA_TEXT_FONT_DESIGNS.findIndex(
    (design) => !style.monospace && style.fontDesign === design
  );
  const selectedPresetLayout = presetLayouts[style.preset as MediaTextPreset];

  return (
    <AppBottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      showDragIndicator={false}
      // Outside taps go to RN backdrop (synced close); no native-first dismiss lag.
      backgroundInteraction="enabled"
      disableInteractiveDismiss
      testID="preview-text-format-sheet">
      <View
        style={styles.root}
        collapsable={false}
        onLayout={(event) => {
          const next = Math.ceil(event.nativeEvent.layout.height);
          if (next > 0) onContentHeightChange?.(next);
        }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: ink }]}>{t('preview.textFormat')}</Text>
          <NativeChromeIconButton
            name="close"
            accessibilityLabel={t('common.cancel')}
            onPress={onDismiss}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
            chromeVariant="glass"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetScrollContent}
          style={styles.edgeToEdgeScroll}>
          <View style={styles.presetTrack}>
            <SlidingPresetHighlight layout={selectedPresetLayout} accentColor={selectedCapsule} />
            {MEDIA_TEXT_PRESETS.map((preset) => {
              const selected = style.preset === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onLayout={(event) => {
                    const next = {
                      x: event.nativeEvent.layout.x,
                      width: event.nativeEvent.layout.width,
                    };
                    setPresetLayouts((current) => {
                      const key = preset.id as MediaTextPreset;
                      const previous = current[key];
                      if (previous?.x === next.x && previous.width === next.width) return current;
                      return { ...current, [key]: next };
                    });
                  }}
                  onPress={() => {
                    tap('light');
                    onChangeStyle(applyMediaTextPreset(preset.id as MediaTextPreset));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(`preview.${preset.labelKey}`)}
                  style={styles.presetChip}>
                  <Text
                    style={{
                      fontSize: preset.chipFontSize,
                      fontWeight: preset.chipFontWeight,
                      color: selected ? selectedInk : ink,
                      fontFamily: resolveMediaTextFontFamily({
                        monospace: preset.monospace,
                        fontDesign: style.fontDesign,
                      }),
                    }}>
                    {t(`preview.${preset.labelKey}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.controlRow}>
          <View style={[styles.capsule, styles.formatCapsule, { backgroundColor: capsule }]}>
            {(
              [
                ['B', 'bold', style.bold, () => onChangeStyle({ bold: !style.bold }), styles.glyphB],
                [
                  'I',
                  'italic',
                  style.italic,
                  () => onChangeStyle({ italic: !style.italic }),
                  styles.glyphI,
                ],
                [
                  'U',
                  'underline',
                  style.underline,
                  () => onChangeStyle({ underline: !style.underline }),
                  styles.glyphU,
                ],
                [
                  'S',
                  'strikethrough',
                  style.strikethrough,
                  () => onChangeStyle({ strikethrough: !style.strikethrough }),
                  styles.glyphS,
                ],
              ] as const
            ).map(([glyph, key, selected, onPress, glyphStyle], index, items) => (
              <CapsuleSegment
                key={key}
                selected={selected}
                onPress={onPress}
                accessibilityLabel={t(`preview.${key}`)}
                showDivider={index > 0}
                dividerColor={divider}
                accentColor={selectedCapsule}
                position={segmentPosition(index, items.length)}>
                <Text style={[glyphStyle, { color: selected ? selectedInk : ink }]}>{glyph}</Text>
              </CapsuleSegment>
            ))}
          </View>

          <View style={[styles.capsule, styles.colorCapsule, { backgroundColor: capsule }]}>
            <View style={styles.colorHit}>
              <ColorMenuChip
                accessibilityLabel={t('preview.textColorMenu')}
                iconSystemName={'pencil.tip' as SFSymbol}
                selectedColor={style.textColor}
                swatches={MEDIA_TEXT_COLOR_SWATCHES}
                onSelect={(textColor) => onChangeStyle({ textColor })}
                t={t}
                labelColor={ink}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: divider }]} />
            <View style={styles.colorHit}>
              <ColorMenuChip
                accessibilityLabel={t('preview.barColorMenu')}
                iconSystemName={'rectangle.fill' as SFSymbol}
                selectedColor={style.barColor}
                swatches={MEDIA_TEXT_BAR_SWATCHES}
                onSelect={(barColor) => onChangeStyle({ barColor })}
                t={t}
                labelColor={ink}
              />
            </View>
          </View>
        </View>

        <View style={styles.controlRow}>
          <View
            style={[styles.capsule, styles.alignCapsule, { backgroundColor: capsule }]}
            onLayout={(event) => setAlignCapsuleWidth(event.nativeEvent.layout.width)}>
            <SlidingSegmentHighlight
              width={alignCapsuleWidth}
              selectedIndex={selectedAlignIndex}
              segmentCount={alignOptions.length}
              accentColor={selectedCapsule}
            />
            {alignOptions.map(([align, icon, labelKey], index, items) => {
              const selected = style.align === align;
              return (
                <CapsuleSegment
                  key={align}
                  selected={selected}
                  onPress={() => onChangeStyle({ align: align as MediaTextAlign })}
                  accessibilityLabel={t(labelKey)}
                  showDivider={index > 0}
                  dividerColor={divider}
                  accentColor={selectedCapsule}
                  position={segmentPosition(index, items.length)}
                  renderSelectedBackground={false}>
                  <AppIcon name={icon} size={APP_ICON_SIZE.xl} color={selected ? selectedInk : ink} />
                </CapsuleSegment>
              );
            })}
          </View>

          <View
            style={[styles.capsule, styles.fontCapsule, { backgroundColor: capsule }]}
            onLayout={(event) => setFontCapsuleWidth(event.nativeEvent.layout.width)}>
            <SlidingSegmentHighlight
              width={fontCapsuleWidth}
              selectedIndex={selectedFontIndex}
              segmentCount={MEDIA_TEXT_FONT_DESIGNS.length}
              accentColor={selectedCapsule}
            />
            {MEDIA_TEXT_FONT_DESIGNS.map((design, index, items) => {
              const selected = !style.monospace && style.fontDesign === design;
              return (
                <CapsuleSegment
                  key={design}
                  selected={selected}
                  onPress={() =>
                    onChangeStyle({
                      fontDesign: design as MediaTextFontDesign,
                      monospace: false,
                    })
                  }
                  accessibilityLabel={t(`preview.${MEDIA_TEXT_FONT_DESIGN_LABEL_KEYS[design]}`)}
                  showDivider={index > 0}
                  dividerColor={divider}
                  accentColor={selectedCapsule}
                  position={segmentPosition(index, items.length)}
                  renderSelectedBackground={false}>
                  <Text
                    style={[
                      styles.fontGlyph,
                      {
                        color: selected ? selectedInk : ink,
                        fontFamily: resolveMediaTextFontFamily({ fontDesign: design }),
                      },
                    ]}>
                    Aa
                  </Text>
                </CapsuleSegment>
              );
            })}
          </View>
        </View>
      </View>
    </AppBottomSheet>
  );
}

export function placeholderColorForText(textColor: string): string {
  const upper = textColor.toUpperCase();
  if (upper === '#FFFFFF') {
    return 'rgba(255,255,255,0.55)';
  }
  return `${upper.length === 7 ? upper : upper.slice(0, 7)}99`;
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    width: '100%',
    position: 'relative',
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: SHEET_TOP_PADDING + 2,
    gap: 12,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: {
    ...typography.title2,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  closeFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NOTES_CAPSULE_LIGHT,
  },
  edgeToEdgeScroll: {
    flexGrow: 0,
    marginHorizontal: -20,
  },
  presetScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 2,
  },
  presetTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: 8,
  },
  presetSlideHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    zIndex: 0,
  },
  presetChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
    minHeight: 52,
    justifyContent: 'center',
    zIndex: 1,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    borderRadius: CONTROL_RADIUS,
    overflow: 'hidden',
    minHeight: 52,
  },
  formatCapsule: {
    flex: 1.95,
  },
  colorCapsule: {
    flex: 1,
  },
  alignCapsule: {
    flex: 1.35,
  },
  fontCapsule: {
    flex: 1.65,
  },
  fontGlyph: {
    fontSize: 17,
    fontWeight: '600',
  },
  segment: {
    flex: 1,
    minWidth: 42,
    height: 52,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    zIndex: 1,
  },
  segmentSlideHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  segmentSelectedFirst: {
    borderTopLeftRadius: CONTROL_RADIUS,
    borderBottomLeftRadius: CONTROL_RADIUS,
  },
  segmentSelectedMiddle: {
    borderRadius: 0,
  },
  segmentSelectedLast: {
    borderTopRightRadius: CONTROL_RADIUS,
    borderBottomRightRadius: CONTROL_RADIUS,
  },
  segmentSelectedOnly: {
    borderRadius: CONTROL_RADIUS,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 13,
    zIndex: 2,
  },
  glyphB: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', default: undefined }),
  },
  glyphI: {
    fontSize: 20,
    fontWeight: '600',
    fontStyle: 'italic',
    fontFamily: Platform.select({ ios: 'System', default: undefined }),
  },
  glyphU: {
    fontSize: 20,
    fontWeight: '600',
    textDecorationLine: 'underline',
    fontFamily: Platform.select({ ios: 'System', default: undefined }),
  },
  glyphS: {
    fontSize: 20,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    fontFamily: Platform.select({ ios: 'System', default: undefined }),
  },
  colorHit: {
    flex: 1,
    minWidth: 54,
    height: 52,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

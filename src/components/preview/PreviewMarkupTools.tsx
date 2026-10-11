import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import NixDrawingCanvas from '../../../modules/nix-media-overlay/NixDrawingCanvas.ios';
import type { NixDrawingCanvasHandle } from '../../../modules/nix-media-overlay/NixDrawingCanvas.types';
import { supportsMediaFiltersAndStickers } from '../../../modules/nix-media-overlay';
import type { MediaDrawingOverlay } from '../../types/mediaDrawingOverlay';
import {
  normalizeMediaDrawingOverlay,
  withDrawingFilter,
  withDrawingStickers,
  withDrawingStrokes,
} from '../../types/mediaDrawingOverlay';
import type { MediaTextOverlay } from '../../types/mediaTextOverlay';
import type { MediaEmojiSticker } from '../../types/mediaStickerOverlay';
import { DEFAULT_MEDIA_FILTER_ID, type MediaFilterId } from '../../lib/mediaFilters';
import { canAddSticker, createEmojiSticker } from '../../lib/previewStickers';
import type { ThemeColors } from '../../theme/colors';
import { NativeChromeIconButton, type ChromeVariant } from '../ui/native-chrome-icon-button';
import { NativePreviewToolGroup } from './NativePreviewToolGroup';
import { PreviewTextTools } from './PreviewTextControls';
import { PreviewFilterSwipeLayer } from './PreviewFilterSwipeLayer';
import { PreviewFilterMenu } from './PreviewFilterMenu';
import { PreviewEmojiStickers } from './PreviewEmojiStickers';
import { PreviewEmojiPickerSheet } from './PreviewEmojiPickerSheet';

const EMPTY_STICKERS: MediaEmojiSticker[] = [];
let stickerIdCounter = 0;

function nextStickerId(): string {
  stickerIdCounter += 1;
  return `sticker-${Date.now().toString(36)}-${stickerIdCounter}`;
}

export type PreviewMarkupChromeSlots = {
  normalTools: ReactNode;
  drawingHeader: ReactNode;
  isTextEditing: boolean;
  isDrawing: boolean;
};

type PreviewMarkupToolsProps = {
  textOverlay: MediaTextOverlay | null | undefined;
  onChangeTextOverlay: (next: MediaTextOverlay | null) => void;
  drawingOverlay: MediaDrawingOverlay | null | undefined;
  onChangeDrawingOverlay: (next: MediaDrawingOverlay | null) => void;
  clampTopPx: number;
  clampBottomPx: number;
  drawingViewportStyle?: StyleProp<ViewStyle>;
  editingViewportHeight?: number;
  /** Visible media frame in window coordinates (unrotated stage) for the caption position. */
  textMediaFrame?: { top: number; height: number };
  colors: ThemeColors;
  chromeVariant?: ChromeVariant;
  renderChrome: (slots: PreviewMarkupChromeSlots) => ReactNode;
  /** Safe-area bottom inset (sticker trash position). */
  bottomInset: number;
  /** Tap on the media (next video segment). Swipes on the media change the filter. */
  onTapMedia?: () => void;
  tapMediaA11yLabel?: string;
};

export function PreviewMarkupTools({
  textOverlay,
  onChangeTextOverlay,
  drawingOverlay,
  onChangeDrawingOverlay,
  clampTopPx,
  clampBottomPx,
  drawingViewportStyle,
  editingViewportHeight,
  textMediaFrame,
  colors,
  chromeVariant = 'glass',
  renderChrome,
  bottomInset,
  onTapMedia,
  tapMediaA11yLabel,
}: PreviewMarkupToolsProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<NixDrawingCanvasHandle>(null);
  const [emojiSheetOpen, setEmojiSheetOpen] = useState(false);
  const layersEnabled = supportsMediaFiltersAndStickers();
  const filter: MediaFilterId = drawingOverlay?.filter ?? DEFAULT_MEDIA_FILTER_ID;
  const stickers = drawingOverlay?.stickers ?? EMPTY_STICKERS;

  const setFilter = (next: MediaFilterId) =>
    onChangeDrawingOverlay(withDrawingFilter(drawingOverlay, next));
  const setStickers = (next: MediaEmojiSticker[]) =>
    onChangeDrawingOverlay(withDrawingStickers(drawingOverlay, next));
  const addSticker = (emoji: string) => {
    setEmojiSheetOpen(false);
    if (!canAddSticker(stickers)) return;
    setStickers([...stickers, createEmojiSticker(emoji, stickers, nextStickerId())]);
  };
  const drawingBeforeEditRef = useRef<MediaDrawingOverlay | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const startDrawing = () => {
    drawingBeforeEditRef.current = normalizeMediaDrawingOverlay(drawingOverlay);
    setCanUndo(false);
    setCanRedo(false);
    setIsDrawing(true);
  };

  const cancelDrawing = () => {
    if (isCommitting) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsDrawing(false);
      return;
    }
    setIsCommitting(true);
    void canvas
      .replaceDrawing(drawingBeforeEditRef.current)
      .catch((error) => console.warn('[PreviewDrawing] Could not restore drawing', error))
      .finally(() => {
        setIsDrawing(false);
        setIsCommitting(false);
      });
  };

  const finishDrawing = () => {
    if (isCommitting) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsDrawing(false);
      return;
    }
    setIsCommitting(true);
    void canvas
      .exportDrawing()
      // Only the strokes come back from the canvas; keep the filter and stickers.
      .then((next) => onChangeDrawingOverlay(withDrawingStrokes(drawingOverlay, next)))
      .catch((error) => console.warn('[PreviewDrawing] Could not export drawing', error))
      .finally(() => {
        setIsDrawing(false);
        setIsCommitting(false);
      });
  };

  const drawingHeader = (
    <View style={styles.drawingHeader}>
      <NativeChromeIconButton
        name="close"
        accessibilityLabel={t('preview.drawingCancel')}
        onPress={cancelDrawing}
        disabled={isCommitting}
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        chromeVariant={chromeVariant}
      />
      <NativePreviewToolGroup
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        tools={[
          {
            name: 'undo',
            accessibilityLabel: t('preview.undo'),
            disabled: !canUndo || isCommitting,
            onPress: () => void canvasRef.current?.undo(),
          },
          {
            name: 'redo',
            accessibilityLabel: t('preview.redo'),
            disabled: !canRedo || isCommitting,
            onPress: () => void canvasRef.current?.redo(),
          },
        ]}
      />
      <NativeChromeIconButton
        name="checkmark"
        accessibilityLabel={t('preview.drawingDone')}
        onPress={finishDrawing}
        disabled={isCommitting}
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        chromeVariant={chromeVariant}
      />
    </View>
  );

  return (
    <>
      {layersEnabled ? (
        <PreviewFilterSwipeLayer
          filter={filter}
          onChangeFilter={setFilter}
          onTap={onTapMedia}
          tapA11yLabel={tapMediaA11yLabel}
          enabled={!isDrawing}
          colors={colors}
        />
      ) : null}
      <NixDrawingCanvas
        ref={canvasRef}
        overlay={drawingOverlay}
        editing={isDrawing}
        onUndoStateChange={({ canUndo: nextUndo, canRedo: nextRedo }) => {
          setCanUndo(nextUndo);
          setCanRedo(nextRedo);
        }}
        style={[styles.canvas, drawingViewportStyle]}
      />
      {layersEnabled ? (
        <PreviewEmojiStickers
          stickers={stickers}
          onChangeStickers={setStickers}
          stageStyle={drawingViewportStyle}
          bottomInset={bottomInset}
          enabled={!isDrawing}
          colors={colors}
        />
      ) : null}
      <View style={styles.textLayer} pointerEvents="box-none">
        <PreviewTextTools
          overlay={textOverlay}
          onChangeOverlay={onChangeTextOverlay}
          clampTopPx={clampTopPx}
          clampBottomPx={clampBottomPx}
          viewportHeight={editingViewportHeight}
          mediaFrame={textMediaFrame}
          // Only a rotated stage gives the text its own (stage-relative) coordinates. Otherwise the
          // clamps, keyboard lift and trash zone are window-relative, so the sticker layer must
          // span the window — inside a letterboxed stage it would be offset by the stage top.
          stickerViewportStyle={editingViewportHeight != null ? drawingViewportStyle : undefined}
          colors={colors}
          chromeVariant={chromeVariant}
          stickerPointerEvents={isDrawing ? 'none' : 'box-none'}
          renderTextButton={(startTextEditing) => (
            <View style={styles.normalTools}>
              <NativeChromeIconButton
                name="pencilTip"
                accessibilityLabel={t('preview.draw')}
                onPress={startDrawing}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
                chromeVariant={chromeVariant}
              />
              <NativeChromeIconButton
                name="textFormat"
                accessibilityLabel={t('preview.addText')}
                onPress={startTextEditing}
                backgroundColor={colors.cameraControlBackground}
                tintColor={colors.cameraControlTint}
                chromeVariant={chromeVariant}
              />
              {layersEnabled ? (
                <>
                  <NativeChromeIconButton
                    name="emojiSticker"
                    accessibilityLabel={t('preview.addSticker')}
                    onPress={() => setEmojiSheetOpen(true)}
                    backgroundColor={colors.cameraControlBackground}
                    tintColor={colors.cameraControlTint}
                    chromeVariant={chromeVariant}
                  />
                  <PreviewFilterMenu
                    filter={filter}
                    onChangeFilter={setFilter}
                    colors={colors}
                    chromeVariant={chromeVariant}
                  />
                </>
              ) : null}
            </View>
          )}
          renderChrome={({ textButton, isEditing }) =>
            renderChrome({
              normalTools: textButton,
              drawingHeader,
              isTextEditing: isEditing,
              isDrawing,
            })
          }
        />
      </View>
      {layersEnabled ? (
        <PreviewEmojiPickerSheet
          isPresented={emojiSheetOpen}
          onDismiss={() => setEmojiSheetOpen(false)}
          onPick={addSticker}
          canAdd={canAddSticker(stickers)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9,
  },
  textLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  drawingHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // A vertical column (Snapchat-style): four tools do not fit next to the left cluster.
  normalTools: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
});

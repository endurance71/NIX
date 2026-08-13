import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import NixDrawingCanvas from '../../../modules/nix-media-overlay/NixDrawingCanvas.ios';
import type { NixDrawingCanvasHandle } from '../../../modules/nix-media-overlay/NixDrawingCanvas.types';
import type { MediaDrawingOverlay } from '../../types/mediaDrawingOverlay';
import { normalizeMediaDrawingOverlay } from '../../types/mediaDrawingOverlay';
import type { MediaTextOverlay } from '../../types/mediaTextOverlay';
import type { ThemeColors } from '../../theme/colors';
import { NativeChromeIconButton, type ChromeVariant } from '../ui/native-chrome-icon-button';
import { NativePreviewToolGroup } from './NativePreviewToolGroup';
import { PreviewTextTools } from './PreviewTextControls';

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
  colors: ThemeColors;
  chromeVariant?: ChromeVariant;
  renderChrome: (slots: PreviewMarkupChromeSlots) => ReactNode;
};

export function PreviewMarkupTools({
  textOverlay,
  onChangeTextOverlay,
  drawingOverlay,
  onChangeDrawingOverlay,
  clampTopPx,
  clampBottomPx,
  colors,
  chromeVariant = 'glass',
  renderChrome,
}: PreviewMarkupToolsProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<NixDrawingCanvasHandle>(null);
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
      .then((next) => onChangeDrawingOverlay(normalizeMediaDrawingOverlay(next)))
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
      <NixDrawingCanvas
        ref={canvasRef}
        overlay={drawingOverlay}
        editing={isDrawing}
        onUndoStateChange={({ canUndo: nextUndo, canRedo: nextRedo }) => {
          setCanUndo(nextUndo);
          setCanRedo(nextRedo);
        }}
        style={styles.canvas}
      />
      <View style={styles.textLayer} pointerEvents="box-none">
        <PreviewTextTools
          overlay={textOverlay}
          onChangeOverlay={onChangeTextOverlay}
          clampTopPx={clampTopPx}
          clampBottomPx={clampBottomPx}
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
  normalTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});

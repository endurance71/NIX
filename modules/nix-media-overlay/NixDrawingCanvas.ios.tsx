import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ComponentType, RefAttributes } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import type { MediaDrawingOverlay } from '../../src/types/mediaDrawingOverlay';
import type {
  NixDrawingCanvasHandle,
  NixDrawingCanvasProps,
} from './NixDrawingCanvas.types';

type UndoState = { canUndo: boolean; canRedo: boolean };

type NativeDrawingCanvasHandle = {
  replaceDrawing(data: string | null, width: number, height: number): Promise<void>;
  exportDrawing(): Promise<MediaDrawingOverlay | null>;
  undo(): Promise<void>;
  redo(): Promise<void>;
};

type NativeDrawingCanvasProps = ViewProps & {
  drawingData?: string | null;
  referenceWidth?: number;
  referenceHeight?: number;
  editing?: boolean;
  onUndoStateChange?: (event: NativeSyntheticEvent<UndoState>) => void;
};

const NativeDrawingCanvas = requireNativeViewManager<NativeDrawingCanvasProps>(
  'NixMediaOverlay'
) as ComponentType<NativeDrawingCanvasProps & RefAttributes<NativeDrawingCanvasHandle>>;

const NixDrawingCanvas = forwardRef<NixDrawingCanvasHandle, NixDrawingCanvasProps>(
  function NixDrawingCanvas({ overlay, editing, onUndoStateChange, style }, forwardedRef) {
    const nativeRef = useRef<NativeDrawingCanvasHandle | null>(null);

    useImperativeHandle(
      forwardedRef,
      () => ({
        replaceDrawing: (next) =>
          nativeRef.current?.replaceDrawing(
            next?.data ?? null,
            next?.width ?? 0,
            next?.height ?? 0
          ) ?? Promise.resolve(),
        exportDrawing: () => nativeRef.current?.exportDrawing() ?? Promise.resolve(null),
        undo: () => nativeRef.current?.undo() ?? Promise.resolve(),
        redo: () => nativeRef.current?.redo() ?? Promise.resolve(),
      }),
      []
    );

    return (
      <NativeDrawingCanvas
        ref={nativeRef}
        style={style}
        drawingData={overlay?.data ?? null}
        referenceWidth={overlay?.width ?? 0}
        referenceHeight={overlay?.height ?? 0}
        editing={editing}
        onUndoStateChange={(event) => onUndoStateChange?.(event.nativeEvent)}
      />
    );
  }
);

export default NixDrawingCanvas;

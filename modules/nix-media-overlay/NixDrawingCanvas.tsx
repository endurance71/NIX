import { forwardRef, useImperativeHandle } from 'react';
import type {
  NixDrawingCanvasHandle,
  NixDrawingCanvasProps,
} from './NixDrawingCanvas.types';

export const NixDrawingCanvas = forwardRef<NixDrawingCanvasHandle, NixDrawingCanvasProps>(
  function NixDrawingCanvasFallback(_, forwardedRef) {
    useImperativeHandle(
      forwardedRef,
      () => ({
        replaceDrawing: async () => undefined,
        exportDrawing: async () => null,
        undo: async () => undefined,
        redo: async () => undefined,
      }),
      []
    );
    return null;
  }
);

export type { NixDrawingCanvasHandle } from './NixDrawingCanvas.types';

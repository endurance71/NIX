import type { ComponentType, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { MediaDrawingOverlay } from '../../src/types/mediaDrawingOverlay';

export type NixDrawingCanvasHandle = {
  replaceDrawing: (overlay: MediaDrawingOverlay | null) => Promise<void>;
  exportDrawing: () => Promise<MediaDrawingOverlay | null>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export type NixDrawingCanvasProps = {
  ref?: Ref<NixDrawingCanvasHandle>;
  overlay: MediaDrawingOverlay | null | undefined;
  editing: boolean;
  onUndoStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  style?: StyleProp<ViewStyle>;
};

export type NixDrawingCanvasComponent = ComponentType<NixDrawingCanvasProps>;

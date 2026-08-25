import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  clampOverlayY,
  createDefaultMediaTextOverlay,
  defaultMediaTextOverlayStyle,
  normalizeMediaTextAlign,
  normalizeMediaTextFontDesign,
  normalizeMediaTextPreset,
  normalizeHexColor,
  normalizeMediaTextOverlay,
  type MediaTextAlign,
  type MediaTextFontDesign,
  type MediaTextOverlay,
  type MediaTextOverlayStyle,
  type MediaTextPreset,
} from '../types/mediaTextOverlay';
import { applyMediaTextPreset } from '../theme/mediaTextOverlayPresets';
import { trackEvent } from '../lib/telemetry';

export type PreviewTextEditorState = {
  editing: boolean;
  draftText: string;
  y: number;
  fontSize: number;
  textColor: string;
  barColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  monospace: boolean;
  fontDesign: MediaTextFontDesign;
  preset: MediaTextPreset;
  align: MediaTextAlign;
};

export type PreviewTextStylePatch = Partial<MediaTextOverlayStyle> & {
  fontSize?: number;
  preset?: MediaTextPreset;
};

type UsePreviewTextOverlayArgs = {
  overlay: MediaTextOverlay | null | undefined;
  onChangeOverlay: (next: MediaTextOverlay | null) => void;
  /** Top inset in points reserved for chrome (close / timer). */
  clampTopPx: number;
  /** Bottom inset in points reserved for chrome (save / send). */
  clampBottomPx: number;
  /** Height of the media stage when it differs from the locked screen viewport. */
  viewportHeight?: number;
};

function applyPreviewTextStylePatch(
  previous: PreviewTextEditorState,
  patch: PreviewTextStylePatch
): PreviewTextEditorState {
  const defaults = defaultMediaTextOverlayStyle();
  const presetPatch =
    patch.preset != null ? applyMediaTextPreset(normalizeMediaTextPreset(patch.preset)) : null;
  const fontDesign =
    patch.fontDesign != null
      ? normalizeMediaTextFontDesign(patch.fontDesign)
      : previous.fontDesign;
  const leavingMonospaceViaFont =
    patch.fontDesign != null && previous.preset === 'monospace' && presetPatch == null;

  return {
    ...previous,
    textColor:
      patch.textColor != null
        ? normalizeHexColor(patch.textColor, defaults.textColor)
        : previous.textColor,
    barColor:
      patch.barColor != null
        ? normalizeHexColor(patch.barColor, defaults.barColor)
        : previous.barColor,
    bold:
      typeof patch.bold === 'boolean'
        ? patch.bold
        : (presetPatch?.bold ?? previous.bold),
    italic: typeof patch.italic === 'boolean' ? patch.italic : previous.italic,
    underline:
      typeof patch.underline === 'boolean' ? patch.underline : previous.underline,
    strikethrough:
      typeof patch.strikethrough === 'boolean'
        ? patch.strikethrough
        : previous.strikethrough,
    monospace:
      typeof patch.monospace === 'boolean'
        ? patch.monospace
        : patch.fontDesign != null
          ? false
          : (presetPatch?.monospace ?? previous.monospace),
    fontDesign,
    preset: leavingMonospaceViaFont
      ? 'body'
      : (presetPatch?.preset ?? previous.preset),
    fontSize:
      typeof patch.fontSize === 'number' &&
      Number.isFinite(patch.fontSize) &&
      patch.fontSize > 0
        ? patch.fontSize
        : (presetPatch?.fontSize ?? previous.fontSize),
    align:
      patch.align != null ? normalizeMediaTextAlign(patch.align) : previous.align,
  };
}

export function usePreviewTextOverlay({
  overlay,
  onChangeOverlay,
  clampTopPx,
  clampBottomPx,
  viewportHeight,
}: UsePreviewTextOverlayArgs) {
  const { height: windowHeight } = useWindowDimensions();
  const [editor, setEditor] = useState<PreviewTextEditorState | null>(null);

  const editingHeight = viewportHeight ?? windowHeight;
  const usableHeight = Math.max(1, editingHeight - clampTopPx - clampBottomPx);

  const yToTopPx = (y: number) => clampTopPx + clampOverlayY(y) * usableHeight;

  const topPxToY = (topPx: number) =>
    clampOverlayY((topPx - clampTopPx) / usableHeight);

  const committed = normalizeMediaTextOverlay(overlay);

  const startEditing = () => {
    const base = committed ?? createDefaultMediaTextOverlay('');
    const style = defaultMediaTextOverlayStyle();
    setEditor({
      editing: true,
      draftText: base.text,
      y: base.y,
      fontSize: base.fontSize,
      textColor: base.textColor ?? style.textColor,
      barColor: base.barColor ?? style.barColor,
      bold: base.bold ?? style.bold,
      italic: base.italic ?? style.italic,
      underline: base.underline ?? style.underline,
      strikethrough: base.strikethrough ?? style.strikethrough,
      monospace: base.monospace ?? style.monospace,
      fontDesign: base.fontDesign ?? style.fontDesign,
      preset: base.preset ?? style.preset,
      align: base.align ?? style.align,
    });
  };

  const cancelEditing = () => {
    setEditor(null);
  };

  const confirmEditing = () => {
    if (!editor) return;
    const next = normalizeMediaTextOverlay({
      text: editor.draftText,
      y: editor.y,
      fontSize: editor.fontSize,
      textColor: editor.textColor,
      barColor: editor.barColor,
      bold: editor.bold,
      italic: editor.italic,
      underline: editor.underline,
      strikethrough: editor.strikethrough,
      monospace: editor.monospace,
      fontDesign: editor.fontDesign,
      preset: editor.preset,
      align: editor.align,
    });
    if (next) {
      onChangeOverlay(next);
      trackEvent('preview_text_added', {
        text_length: next.text.length,
        y: next.y,
        bold: next.bold,
        italic: next.italic,
        underline: next.underline,
        strikethrough: next.strikethrough,
        preset: next.preset,
        font_design: next.fontDesign,
        align: next.align,
      });
    } else {
      onChangeOverlay(null);
      if (committed) {
        trackEvent('preview_text_removed', { reason: 'empty_confirm' });
      }
    }
    setEditor(null);
  };

  const setDraftText = (text: string) => {
    setEditor((prev) => (prev ? { ...prev, draftText: text } : prev));
  };

  const setY = (y: number, mode: 'editor' | 'committed') => {
    const nextY = clampOverlayY(y);
    if (mode === 'editor') {
      setEditor((prev) => (prev ? { ...prev, y: nextY } : prev));
      return;
    }
    if (!committed) return;
    onChangeOverlay({ ...committed, y: nextY });
  };

  const patchDraftStyle = (patch: PreviewTextStylePatch) => {
    if (!editor) return;
    const next = applyPreviewTextStylePatch(editor, patch);
    setEditor(next);
    trackEvent('preview_text_format_changed', {
      text_color: next.textColor,
      bar_color: next.barColor,
      bold: next.bold,
      italic: next.italic,
      underline: next.underline,
      strikethrough: next.strikethrough,
      monospace: next.monospace,
      font_design: next.fontDesign,
      preset: next.preset,
      align: next.align,
    });
  };

  const removeOverlay = () => {
    onChangeOverlay(null);
    setEditor(null);
    trackEvent('preview_text_removed', { reason: 'manual' });
  };

  return {
    committed,
    editor,
    isEditing: Boolean(editor),
    startEditing,
    cancelEditing,
    confirmEditing,
    setDraftText,
    setY,
    patchDraftStyle,
    removeOverlay,
    yToTopPx,
    topPxToY,
    usableHeight,
  };
}

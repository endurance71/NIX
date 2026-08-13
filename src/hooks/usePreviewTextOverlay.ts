import { useCallback, useMemo, useState } from 'react';
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
};

export function usePreviewTextOverlay({
  overlay,
  onChangeOverlay,
  clampTopPx,
  clampBottomPx,
}: UsePreviewTextOverlayArgs) {
  const { height: windowHeight } = useWindowDimensions();
  const [editor, setEditor] = useState<PreviewTextEditorState | null>(null);

  const usableHeight = Math.max(1, windowHeight - clampTopPx - clampBottomPx);

  const yToTopPx = useCallback(
    (y: number) => clampTopPx + clampOverlayY(y) * usableHeight,
    [clampTopPx, usableHeight]
  );

  const topPxToY = useCallback(
    (topPx: number) => clampOverlayY((topPx - clampTopPx) / usableHeight),
    [clampTopPx, usableHeight]
  );

  const committed = useMemo(() => normalizeMediaTextOverlay(overlay), [overlay]);

  const startEditing = useCallback(() => {
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
  }, [committed]);

  const cancelEditing = useCallback(() => {
    setEditor(null);
  }, []);

  const confirmEditing = useCallback(() => {
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
  }, [committed, editor, onChangeOverlay]);

  const setDraftText = useCallback((text: string) => {
    setEditor((prev) => (prev ? { ...prev, draftText: text } : prev));
  }, []);

  const setY = useCallback(
    (y: number, mode: 'editor' | 'committed') => {
      const nextY = clampOverlayY(y);
      if (mode === 'editor') {
        setEditor((prev) => (prev ? { ...prev, y: nextY } : prev));
        return;
      }
      if (!committed) return;
      onChangeOverlay({ ...committed, y: nextY });
    },
    [committed, onChangeOverlay]
  );

  const patchDraftStyle = useCallback((patch: PreviewTextStylePatch) => {
    setEditor((prev) => {
      if (!prev) return prev;
      const defaults = defaultMediaTextOverlayStyle();
      const presetPatch =
        patch.preset != null ? applyMediaTextPreset(normalizeMediaTextPreset(patch.preset)) : null;
      const fontDesign =
        patch.fontDesign != null
          ? normalizeMediaTextFontDesign(patch.fontDesign)
          : prev.fontDesign;
      const leavingMonospaceViaFont =
        patch.fontDesign != null && prev.preset === 'monospace' && presetPatch == null;
      const next = {
        ...prev,
        textColor:
          patch.textColor != null
            ? normalizeHexColor(patch.textColor, defaults.textColor)
            : prev.textColor,
        barColor:
          patch.barColor != null
            ? normalizeHexColor(patch.barColor, defaults.barColor)
            : prev.barColor,
        bold: typeof patch.bold === 'boolean' ? patch.bold : (presetPatch?.bold ?? prev.bold),
        italic: typeof patch.italic === 'boolean' ? patch.italic : prev.italic,
        underline: typeof patch.underline === 'boolean' ? patch.underline : prev.underline,
        strikethrough:
          typeof patch.strikethrough === 'boolean' ? patch.strikethrough : prev.strikethrough,
        monospace:
          typeof patch.monospace === 'boolean'
            ? patch.monospace
            : patch.fontDesign != null
              ? false
              : (presetPatch?.monospace ?? prev.monospace),
        fontDesign,
        preset: leavingMonospaceViaFont
          ? 'body'
          : (presetPatch?.preset ?? prev.preset),
        fontSize:
          typeof patch.fontSize === 'number' && Number.isFinite(patch.fontSize) && patch.fontSize > 0
            ? patch.fontSize
            : (presetPatch?.fontSize ?? prev.fontSize),
        align: patch.align != null ? normalizeMediaTextAlign(patch.align) : prev.align,
      };
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
      return next;
    });
  }, []);

  const removeOverlay = useCallback(() => {
    onChangeOverlay(null);
    setEditor(null);
    trackEvent('preview_text_removed', { reason: 'manual' });
  }, [onChangeOverlay]);

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

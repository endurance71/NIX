import {
  captionMinimumBarHeight,
  captionTopPxFromY,
  captionYFromTopPx,
  clampPreviewTextTopPx,
} from '../lib/mediaTextOverlayGeometry';
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
  type MediaTextVariant,
} from '../types/mediaTextOverlay';
import { applyMediaTextPreset } from '../theme/mediaTextOverlayPresets';
import { trackEvent } from '../lib/telemetry';

export type PreviewTextEditorState = {
  editing: boolean;
  variant: MediaTextVariant;
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
  /**
   * Visible media frame in the sticker layer's coordinates (a letterboxed photo sits inside the
   * window). Defaults to the whole editing height.
   */
  mediaFrame?: { top: number; height: number };
  /** Measured height of the caption bar; 0 until laid out. */
  barHeight?: number;
  /**
   * The installed binary bakes the caption bar (`supportsMediaTextCaptionBar`). New text starts
   * as a bar then (Snapchat default); otherwise only the sticker exists.
   */
  captionBarAvailable?: boolean;
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
  mediaFrame,
  barHeight = 0,
  captionBarAvailable = false,
}: UsePreviewTextOverlayArgs) {
  const { height: windowHeight } = useWindowDimensions();
  const [editor, setEditor] = useState<PreviewTextEditorState | null>(null);

  const editingHeight = viewportHeight ?? windowHeight;
  const usableHeight = Math.max(1, editingHeight - clampTopPx - clampBottomPx);
  const frameTop = mediaFrame?.top ?? 0;
  const frameHeight = mediaFrame?.height ?? editingHeight;
  const currentFontSize = editor?.fontSize ?? overlay?.fontSize ?? 0;
  const currentVariant = captionBarAvailable
    ? (editor?.variant ?? overlay?.variant ?? 'sticker')
    : 'sticker';
  // Same minimum as the rendered caption until the real bar has been measured.
  const resolvedBarHeight =
    barHeight > 0 ? barHeight : captionMinimumBarHeight(currentVariant, currentFontSize);
  const frame = { top: frameTop, height: frameHeight };

  // `y` is the caption bar's CENTRE as a fraction of the visible media frame — exactly what the
  // native bake draws (`centerY = visible.minY + visible.height * y`). Mapping it through the
  // chrome clamps instead moved the sent caption tens of points away from the preview.
  const yToTopPx = (y: number) =>
    clampPreviewTextTopPx(
      captionTopPxFromY(clampOverlayY(y), frame, resolvedBarHeight),
      clampTopPx,
      clampTopPx + usableHeight,
    );

  const topPxToY = (topPx: number) =>
    clampOverlayY(captionYFromTopPx(topPx, frame, resolvedBarHeight));

  const committed = normalizeMediaTextOverlay(overlay);

  const startEditing = () => {
    const base =
      committed ?? createDefaultMediaTextOverlay('', captionBarAvailable ? 'bar' : 'sticker');
    const style = defaultMediaTextOverlayStyle();
    setEditor({
      editing: true,
      // A bar left over on a binary that cannot bake it is edited as a sticker.
      variant: captionBarAvailable ? base.variant : 'sticker',
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
      variant: editor.variant,
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
        variant: next.variant,
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

  /** Switches the edited caption between the bar and the sticker; the sticker format is kept. */
  const setDraftVariant = (variant: MediaTextVariant) => {
    if (!editor || editor.variant === variant) return;
    if (variant === 'bar' && !captionBarAvailable) return;
    setEditor({ ...editor, variant });
    trackEvent('preview_text_variant_changed', { variant });
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
    setDraftVariant,
    setY,
    patchDraftStyle,
    removeOverlay,
    yToTopPx,
    topPxToY,
    usableHeight,
  };
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_BAKED_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  createDefaultMediaTextOverlay,
  isDefaultBarColor,
  normalizeMediaTextOverlay,
  resolveMediaTextBarColor,
} from './mediaTextOverlay';

describe('normalizeMediaTextOverlay', () => {
  it('uses the light translucent fill and migrates the previous glass sentinel', () => {
    expect(resolveMediaTextBarColor(DEFAULT_MEDIA_TEXT_BAR_COLOR)).toBe(
      DEFAULT_MEDIA_TEXT_BAKED_BAR_COLOR
    );
    expect(resolveMediaTextBarColor('#0000008C')).toBe(DEFAULT_MEDIA_TEXT_BAR_COLOR);
    expect(resolveMediaTextBarColor('#FFFFFF8C')).toBe(DEFAULT_MEDIA_TEXT_BAR_COLOR);
    expect(resolveMediaTextBarColor('#000000E6')).toBe('#000000E6');
  });

  it('returns null for empty text', () => {
    expect(normalizeMediaTextOverlay({ text: '  ', y: 0.5, fontSize: 34 })).toBeNull();
  });

  it('fills missing style fields with defaults', () => {
    const next = normalizeMediaTextOverlay({
      text: 'hi',
      y: 0.3,
      fontSize: 34,
    });
    expect(next).toEqual({
      text: 'hi',
      y: 0.3,
      fontSize: 34,
      textColor: DEFAULT_MEDIA_TEXT_COLOR,
      barColor: DEFAULT_MEDIA_TEXT_BAR_COLOR,
      bold: true,
      italic: false,
      underline: false,
      strikethrough: false,
      monospace: false,
      fontDesign: 'system',
      preset: 'title',
      align: 'center',
    });
  });

  it('preserves custom style', () => {
    const next = normalizeMediaTextOverlay({
      text: 'hi',
      y: 0.2,
      fontSize: 40,
      textColor: '#FF9500',
      barColor: '#007AFFCC',
      bold: false,
      italic: true,
      underline: true,
      strikethrough: true,
      monospace: true,
      fontDesign: 'serif',
      preset: 'monospace',
      align: 'left',
    });
    expect(next?.textColor).toBe('#FF9500');
    expect(next?.barColor).toBe('#007AFFCC');
    expect(next?.bold).toBe(false);
    expect(next?.italic).toBe(true);
    expect(next?.underline).toBe(true);
    expect(next?.strikethrough).toBe(true);
    expect(next?.monospace).toBe(true);
    expect(next?.fontDesign).toBe('serif');
    expect(next?.preset).toBe('monospace');
    expect(next?.align).toBe('left');
  });

  it('createDefaultMediaTextOverlay includes style defaults', () => {
    const overlay = createDefaultMediaTextOverlay('x');
    expect(overlay.bold).toBe(true);
    expect(overlay.italic).toBe(false);
    expect(overlay.fontDesign).toBe('system');
    expect(overlay.preset).toBe('title');
    expect(overlay.align).toBe('center');
    expect(isDefaultBarColor(overlay.barColor)).toBe(true);
  });

  it('defines valid min, max, and default font size bounds', () => {
    expect(MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE).toBe(14);
    expect(MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE).toBe(60);
    expect(DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE).toBe(34);
    expect(MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE).toBeLessThan(DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE);
    expect(DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE).toBeLessThan(MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE);
  });
});

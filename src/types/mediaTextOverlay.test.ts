import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  createDefaultMediaTextOverlay,
  isDefaultBarColor,
  normalizeMediaTextOverlay,
} from './mediaTextOverlay';

describe('normalizeMediaTextOverlay', () => {
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
});

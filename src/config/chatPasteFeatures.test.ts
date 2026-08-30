import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRoadmapFeature } from './iosRoadmapFeatures';

describe('chatPasteFeatures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('jest wyłączona, gdy zmienna nie jest true', async () => {
    vi.stubEnv('EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED', undefined);
    const { chatPasteFeatures } = await import('./chatPasteFeatures');
    expect(chatPasteFeatures.pasteInput).toBe(false);
  });

  it('włącza się wyłącznie jawnym true', async () => {
    vi.stubEnv('EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED', 'true');
    const { chatPasteFeatures } = await import('./chatPasteFeatures');
    expect(chatPasteFeatures.pasteInput).toBe(true);
  });

  it('nie korzysta z remote config ani z internal roadmap bundle', () => {
    expect(resolveRoadmapFeature(undefined)).toBe(false);
  });
});

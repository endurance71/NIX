import { describe, expect, it, vi } from 'vitest';
import { createVoicePlaybackStore } from './voicePlaybackStore';

describe('voicePlaybackStore', () => {
  it('only the active message has a non-idle view', () => {
    const store = createVoicePlaybackStore();
    const idle = store.getBubble('a');
    store.set({ messageId: 'a', phase: 'playing', progress: 0.25 });
    expect(store.getBubble('a')).toEqual({ phase: 'playing', progress: 0.25 });
    expect(store.getBubble('b')).toBe(idle);
  });

  it('keeps snapshots stable and skips no-op updates', () => {
    const store = createVoicePlaybackStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ messageId: 'a', phase: 'loading', progress: 0 });
    const view = store.getBubble('a');
    store.set({ messageId: 'a', phase: 'loading', progress: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getBubble('a')).toBe(view);
  });

  it('idle resets the active message and clamps progress', () => {
    const store = createVoicePlaybackStore();
    store.set({ messageId: 'a', phase: 'playing', progress: 3 });
    expect(store.getBubble('a').progress).toBe(1);
    store.set({ messageId: 'a', phase: 'idle', progress: 0.5 });
    expect(store.getSnapshot()).toEqual({ messageId: null, phase: 'idle', progress: 0 });
  });
});

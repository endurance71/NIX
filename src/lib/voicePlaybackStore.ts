/**
 * One voice message plays at a time in a chat. The store holds which one and its progress, so
 * only the active bubble re-renders while audio plays (`useSyncExternalStore` per message id).
 */
export type VoicePlaybackPhase = 'idle' | 'loading' | 'playing' | 'paused';

export type VoicePlaybackSnapshot = {
  messageId: string | null;
  phase: VoicePlaybackPhase;
  /** 0–1 of the active message. */
  progress: number;
};

export type VoiceBubblePlayback = {
  phase: VoicePlaybackPhase;
  progress: number;
};

const IDLE_BUBBLE: VoiceBubblePlayback = { phase: 'idle', progress: 0 };

export function createVoicePlaybackStore() {
  let snapshot: VoicePlaybackSnapshot = { messageId: null, phase: 'idle', progress: 0 };
  // Per-message cached views keep `getSnapshot` referentially stable between unrelated updates.
  let activeView: VoiceBubblePlayback = IDLE_BUBBLE;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): VoicePlaybackSnapshot {
      return snapshot;
    },
    /** The bubble's own view: the idle constant for every message but the active one. */
    getBubble(messageId: string): VoiceBubblePlayback {
      return snapshot.messageId === messageId ? activeView : IDLE_BUBBLE;
    },
    set(next: VoicePlaybackSnapshot) {
      const progress = Math.min(1, Math.max(0, Number.isFinite(next.progress) ? next.progress : 0));
      const normalized: VoicePlaybackSnapshot =
        next.phase === 'idle' ? { messageId: null, phase: 'idle', progress: 0 } : { ...next, progress };
      if (
        normalized.messageId === snapshot.messageId
        && normalized.phase === snapshot.phase
        && Math.abs(normalized.progress - snapshot.progress) < 0.001
      ) {
        return;
      }
      snapshot = normalized;
      activeView =
        normalized.messageId === null ? IDLE_BUBBLE : { phase: normalized.phase, progress: normalized.progress };
      emit();
    },
  };
}

export type VoicePlaybackStore = ReturnType<typeof createVoicePlaybackStore>;

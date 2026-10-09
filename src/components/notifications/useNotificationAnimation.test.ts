import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appNotificationQueue as queue, type NotificationToken } from '../../lib/notificationQueue';
import { useNotificationAnimation } from './useNotificationAnimation';

const native = vi.hoisted(() => {
  type Completion = (finished?: boolean) => void;
  type Animation = {
    type: 'spring' | 'timing' | 'delay';
    target?: number;
    config?: { duration?: number; reduceMotion?: string };
    complete?: Completion;
    child?: Animation;
  };
  type Shared = { value: number | Animation };
  type Effect = { dependencies: unknown[]; cleanup?: () => void };
  type Callback = { dependencies: unknown[]; value: unknown };
  const shared: Shared[] = [];
  const effects: Effect[] = [];
  const callbacks: Callback[] = [];
  const pending: (() => void)[] = [];
  let sharedIndex = 0;
  let effectIndex = 0;
  let callbackIndex = 0;
  const equal = (left: unknown[], right: unknown[]) =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

  return {
    shared,
    spring: vi.fn((target: number, config: Animation['config'], complete?: Completion): Animation =>
      ({ type: 'spring', target, config, complete })),
    timing: vi.fn((target: number, config: Animation['config'], complete?: Completion): Animation =>
      ({ type: 'timing', target, config, complete })),
    delay: vi.fn((_delay: number, child: Animation): Animation => ({ type: 'delay', child })),
    cancel: vi.fn((_value: Shared) => {}),
    schedule: vi.fn((callback: (token: NotificationToken) => void, token: NotificationToken) => callback(token)),
    haptic: vi.fn(),
    announce: vi.fn(),
    beginRender: () => { sharedIndex = 0; effectIndex = 0; callbackIndex = 0; },
    sharedValue: (initial: number) => {
      const index = sharedIndex++;
      shared[index] ??= { value: initial };
      return shared[index];
    },
    callback: (value: unknown, dependencies: unknown[]) => {
      const index = callbackIndex++;
      if (!callbacks[index] || !equal(callbacks[index].dependencies, dependencies)) {
        callbacks[index] = { value, dependencies };
      }
      return callbacks[index].value;
    },
    effect: (effect: () => void | (() => void), dependencies: unknown[]) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && equal(previous.dependencies, dependencies)) return;
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        effects[index] = { dependencies, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
      });
    },
    flushEffects: () => { pending.splice(0).forEach((effect) => effect()); },
    unmount: () => {
      effects.forEach((effect) => effect.cleanup?.());
      effects.length = 0;
      shared.length = 0;
      callbacks.length = 0;
      pending.length = 0;
    },
    complete: (value: number | Animation, finished = true) => {
      if (typeof value === 'number') throw new Error('Expected a scheduled animation');
      let animation = value;
      while (animation.child) animation = animation.child;
      if (!animation.complete) throw new Error('Expected an animation completion callback');
      animation.complete(finished);
    },
  };
});

vi.mock('react', () => ({ useEffect: native.effect, useCallback: native.callback }));
vi.mock('react-native', () => ({ AccessibilityInfo: { announceForAccessibilityWithOptions: native.announce } }));
vi.mock('react-native-reanimated', () => ({
  useSharedValue: native.sharedValue,
  withSpring: native.spring,
  withTiming: native.timing,
  withDelay: native.delay,
  cancelAnimation: native.cancel,
  ReduceMotion: { Never: 'never' },
}));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: native.schedule }));
vi.mock('../../lib/haptics', () => ({ notify: native.haptic }));

function token(): NotificationToken {
  const snapshot = queue.getSnapshot();
  return { id: snapshot.notification!.id, generation: snapshot.generation };
}

function render(options: { ready?: boolean; reducedMotion?: boolean; morph?: boolean; screenReader?: boolean } = {}) {
  native.beginRender();
  // React hooks are simulated here; native completion callbacks are driven explicitly below.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const motion = useNotificationAnimation(queue.getSnapshot(), options.reducedMotion ?? false,
    options.morph ?? true, options.screenReader ?? false, options.ready ?? true);
  native.flushEffects();
  return motion;
}

beforeEach(() => {
  native.unmount();
  vi.clearAllMocks();
  vi.useFakeTimers();
  queue.clear();
  queue.setScreenReader(false);
  queue.setActive(true);
});
afterEach(() => {
  native.unmount();
  queue.setActive(false);
  vi.useRealTimers();
});

describe('notification animation lifecycle', () => {
  it('waits for the native surface before starting entry or the notification lifetime', () => {
    queue.enqueue({ title: 'Saved', kind: 'success' });
    render({ ready: false });
    vi.advanceTimersByTime(10000);
    expect(native.spring).not.toHaveBeenCalled();
    expect(native.timing).not.toHaveBeenCalled();
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(vi.getTimerCount()).toBe(0);

    render({ ready: true });
    expect(native.spring).toHaveBeenCalled();
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(native.haptic).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts readable time and feedback only after a successful reveal, once', () => {
    queue.enqueue({ title: 'Saved', kind: 'success' });
    render();
    const reveal = native.shared[2].value;
    vi.advanceTimersByTime(10000);
    native.complete(reveal, false);
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(native.haptic).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    native.complete(reveal);
    native.complete(reveal);
    expect(queue.getSnapshot().phase).toBe('visible');
    expect(native.haptic).toHaveBeenCalledExactlyOnceWith('success');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot().phase).toBe('exiting');
  });

  it('keeps the exiting item until the return animation completes, then reveals the next item', () => {
    queue.enqueue({ title: 'First' });
    queue.enqueue({ title: 'Next' });
    render();
    native.complete(native.shared[2].value);
    queue.dismiss(token());
    render();
    const returning = native.shared[0].value;
    native.complete(returning, false);
    expect(queue.getSnapshot().notification?.title).toBe('First');
    expect(queue.getSnapshot().phase).toBe('exiting');
    native.complete(returning);
    expect(queue.getSnapshot().notification?.title).toBe('Next');
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a reveal callback from before clear, even when the new notification reuses its ID', () => {
    queue.enqueue({ title: 'Old', kind: 'success', id: 'reused' });
    render();
    const oldReveal = native.shared[2].value;
    native.unmount();
    queue.clear();
    queue.enqueue({ title: 'New', kind: 'success', id: 'reused' });
    render();
    native.complete(oldReveal);
    expect(queue.getSnapshot().notification?.title).toBe('New');
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(native.haptic).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['visible', 'exiting'] as const)('ignores an old return callback while a new item is %s', (phase) => {
    queue.enqueue({ title: 'Old', id: 'reused' });
    render();
    native.complete(native.shared[2].value);
    queue.dismiss(token());
    render();
    const oldReturn = native.shared[0].value;
    native.unmount();
    queue.clear();
    queue.enqueue({ title: 'New', id: 'reused' });
    render();
    native.complete(native.shared[2].value);
    if (phase === 'exiting') {
      queue.enqueue({ title: 'Waiting' });
      queue.dismiss(token());
      render();
    }
    const next = queue.getSnapshot();
    native.complete(oldReturn);
    expect(queue.getSnapshot()).toBe(next);
    expect(vi.getTimerCount()).toBe(phase === 'visible' ? 1 : 0);
    vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().phase).toBe(phase);
  });

  it('uses a short fade without springs for Reduce Motion, including dismissal', () => {
    queue.enqueue({ title: 'Saved' });
    render({ reducedMotion: true });
    expect(native.spring).not.toHaveBeenCalled();
    expect(native.delay).not.toHaveBeenCalled();
    expect(native.timing).toHaveBeenCalledWith(1, { duration: 120, reduceMotion: 'never' }, expect.any(Function));
    native.complete(native.shared[2].value);
    queue.dismiss(token());
    render({ reducedMotion: true });
    expect(native.spring).not.toHaveBeenCalled();
    native.complete(native.shared[1].value);
    expect(queue.getSnapshot().phase).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('announces full VoiceOver content after reveal without automatic dismissal', () => {
    queue.setScreenReader(true);
    queue.enqueue({ title: 'Saved', message: 'Changes are ready' });
    render({ screenReader: true });
    expect(native.announce).not.toHaveBeenCalled();
    native.complete(native.shared[2].value);
    expect(native.announce).toHaveBeenCalledExactlyOnceWith('Saved. Changes are ready', { queue: true });
    vi.advanceTimersByTime(60000);
    expect(queue.getSnapshot().phase).toBe('visible');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels all shared animations when the presentation unmounts', () => {
    queue.enqueue({ title: 'Saved' });
    render();
    const values = [...native.shared];
    native.cancel.mockClear();
    native.unmount();
    expect(native.cancel).toHaveBeenCalledTimes(5);
    expect(native.cancel.mock.calls.map(([value]) => value)).toEqual(values);
  });
});

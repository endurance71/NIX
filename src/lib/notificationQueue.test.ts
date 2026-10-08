import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationQueue, type NotificationToken } from './notificationQueue';

let queue: NotificationQueue;
const token = (): NotificationToken => ({
  id: queue.getSnapshot().notification!.id, generation: queue.getSnapshot().generation,
});
const close = () => { const current = token(); queue.dismiss(current); queue.finishDismiss(current); };

beforeEach(() => { vi.useFakeTimers(); queue = new NotificationQueue(); queue.setActive(true); });
afterEach(() => { queue.setActive(false); vi.useRealTimers(); });

describe('notification lifetime', () => {
  it('starts the four-second timeout only after text is revealed', () => {
    queue.enqueue({ title: 'Saved' });
    vi.advanceTimersByTime(9000);
    expect(queue.getSnapshot().phase).toBe('entering');
    queue.markPresented(token());
    vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot().phase).toBe('exiting');
  });
  it.each(['success', 'warning', 'info'] as const)('%s remains readable for four seconds', (kind) => {
    queue.enqueue({ title: kind, kind }); queue.markPresented(token());
    vi.advanceTimersByTime(4000); expect(queue.getSnapshot().phase).toBe('exiting');
  });
  it('errors remain readable for five seconds', () => {
    queue.enqueue({ title: 'Failed', kind: 'error' }); queue.markPresented(token());
    vi.advanceTimersByTime(4000); expect(queue.getSnapshot().phase).toBe('visible');
    vi.advanceTimersByTime(1000); expect(queue.getSnapshot().phase).toBe('exiting');
  });
  it('supports an explicit duration and persistent notifications', () => {
    queue.enqueue({ title: 'Short', duration: 800 }); queue.markPresented(token());
    vi.advanceTimersByTime(800); expect(queue.getSnapshot().phase).toBe('exiting'); close();
    queue.enqueue({ title: 'Persistent', duration: null }); queue.markPresented(token());
    vi.advanceTimersByTime(60000); expect(queue.getSnapshot().phase).toBe('visible');
  });
  it('uses the default timeout for an invalid duration', () => {
    queue.enqueue({ title: 'Saved', duration: NaN }); queue.markPresented(token());
    vi.advanceTimersByTime(4000); expect(queue.getSnapshot().phase).toBe('exiting');
  });
  it('keeps VoiceOver content until explicitly dismissed', () => {
    queue.setScreenReader(true); queue.enqueue({ title: 'Saved' }); queue.markPresented(token());
    vi.advanceTimersByTime(60000); expect(queue.getSnapshot().phase).toBe('visible');
    close(); expect(queue.getSnapshot().notification).toBeNull();
  });
  it('cancels an existing timer when VoiceOver is enabled', () => {
    queue.enqueue({ title: 'Saved' }); queue.markPresented(token()); vi.advanceTimersByTime(3500);
    queue.setScreenReader(true); vi.advanceTimersByTime(60000);
    expect(queue.getSnapshot().phase).toBe('visible');
    queue.setScreenReader(false); vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().phase).toBe('visible');
    vi.advanceTimersByTime(1); expect(queue.getSnapshot().phase).toBe('exiting');
  });
});

describe('bounded queue and deduplication', () => {
  it('preserves the visible item and drops the oldest pending item on overflow', () => {
    ['A', 'B', 'C', 'D'].forEach((title) => queue.enqueue({ title }));
    expect(queue.getSnapshot().notification?.title).toBe('A');
    close(); expect(queue.getSnapshot().notification?.title).toBe('C');
    close(); expect(queue.getSnapshot().notification?.title).toBe('D');
    close(); expect(queue.getSnapshot().phase).toBe('idle');
  });
  it('merges duplicate normalized text without restarting the visible lifetime', () => {
    const id = queue.enqueue({ title: ' Saved ', message: ' Details ' }); queue.markPresented(token());
    vi.advanceTimersByTime(1800);
    expect(queue.enqueue({ title: 'Saved', message: 'Details' })).toBe(id);
    vi.advanceTimersByTime(2200); expect(queue.getSnapshot().phase).toBe('exiting');
    close(); expect(queue.getSnapshot().notification).toBeNull();
  });
  it('merges pending items too', () => {
    queue.enqueue({ title: 'A' }); const id = queue.enqueue({ title: 'B' });
    expect(queue.enqueue({ title: 'B' })).toBe(id);
    close(); close(); expect(queue.getSnapshot().notification).toBeNull();
  });
  it('allows the same text again after two seconds and distinguishes kinds', () => {
    queue.enqueue({ title: 'Same' }); vi.advanceTimersByTime(2001);
    queue.enqueue({ title: 'Same' }); queue.enqueue({ title: 'Same', kind: 'error' });
    close(); expect(queue.getSnapshot().notification?.kind).toBe('info');
    close(); expect(queue.getSnapshot().notification?.kind).toBe('error');
  });
  it('starts the next lifetime after its reveal, even when queued for a long time', () => {
    queue.enqueue({ title: 'A', duration: null }); queue.markPresented(token());
    queue.enqueue({ title: 'B' }); vi.advanceTimersByTime(60000); close();
    expect(queue.getSnapshot().phase).toBe('entering');
    queue.markPresented(token()); vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().phase).toBe('visible');
  });
  it('does not allocate a blank second line or show empty titles', () => {
    queue.enqueue({ title: ' ' }); expect(queue.getSnapshot().phase).toBe('idle');
    queue.enqueue({ title: ' OK ', message: ' ' });
    expect(queue.getSnapshot().notification).toMatchObject({ title: 'OK', message: undefined });
  });
});

describe('session and stale callbacks', () => {
  it('clears displayed and queued account content when the owner changes', () => {
    queue.setOwner('alice'); queue.enqueue({ title: 'A' }); queue.enqueue({ title: 'B' });
    const old = token(); queue.markPresented(old); queue.setOwner('bob');
    expect(queue.getSnapshot().notification).toBeNull();
    queue.enqueue({ title: 'C' }); vi.advanceTimersByTime(10000);
    expect(queue.getSnapshot().phase).toBe('entering');
    expect(queue.finishDismiss(old)).toBe(false);
  });
  it('does not clear notifications on token refresh for the same owner', () => {
    queue.setOwner('alice'); queue.enqueue({ title: 'A' }); queue.setOwner('alice');
    expect(queue.getSnapshot().notification?.title).toBe('A');
  });
  it('discards background notifications and resumes with an empty queue', () => {
    queue.enqueue({ title: 'A' }); queue.enqueue({ title: 'B' }); queue.setActive(false);
    queue.enqueue({ title: 'Private background result' }); queue.setActive(true);
    expect(queue.getSnapshot().notification).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects old reveal, dismissal and exit completion callbacks after a new item enters', () => {
    queue.enqueue({ title: 'A' }); const old = token(); queue.markPresented(old);
    queue.enqueue({ title: 'B' }); close(); const next = token(); queue.markPresented(next);
    expect(queue.markPresented(old)).toBe(false); expect(queue.dismiss(old)).toBe(false);
    expect(queue.finishDismiss(old)).toBe(false); vi.advanceTimersByTime(3999);
    expect(queue.getSnapshot().notification?.title).toBe('B');
    expect(queue.getSnapshot().phase).toBe('visible');
  });
  it('rejects old callbacks even if the caller reuses an explicit ID after clearing', () => {
    queue.enqueue({ title: 'A', id: 'same' }); const old = token(); queue.clear();
    queue.enqueue({ title: 'B', id: 'same' }); expect(queue.markPresented(old)).toBe(false);
    expect(queue.dismiss(old)).toBe(false); expect(queue.getSnapshot().notification?.title).toBe('B');
  });
  it('allows presentation and dismissal only once', () => {
    queue.enqueue({ title: 'A' }); const current = token();
    expect(queue.markPresented(current)).toBe(true); expect(queue.markPresented(current)).toBe(false);
    expect(queue.dismiss(current)).toBe(true); expect(queue.dismiss(current)).toBe(false);
    expect(queue.markPresented(current)).toBe(false); queue.finishDismiss(current);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('removes timers and subscriptions during host cleanup', () => {
    const listener = vi.fn(); const unsubscribe = queue.subscribe(listener);
    queue.enqueue({ title: 'A' }); queue.markPresented(token()); expect(vi.getTimerCount()).toBe(1);
    unsubscribe(); listener.mockClear(); queue.setActive(false);
    expect(vi.getTimerCount()).toBe(0); expect(listener).not.toHaveBeenCalled();
  });
});

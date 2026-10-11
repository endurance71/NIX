import { describe, expect, it, vi } from 'vitest';
import { adjustTextSize, performCameraAccessibleAction } from './cameraAccessibility';

describe('camera accessible controls', () => {
  it('takes a photo through activation and starts video through the named action', () => {
    const handlers = { photo: vi.fn(), startVideo: vi.fn(), stopVideo: vi.fn() };
    const state = { recording: false, preparing: false, disabled: false };
    performCameraAccessibleAction('activate', state, handlers);
    performCameraAccessibleAction('startVideo', state, handlers);
    expect(handlers.photo).toHaveBeenCalledTimes(1);
    expect(handlers.startVideo).toHaveBeenCalledTimes(1);
    expect(handlers.stopVideo).not.toHaveBeenCalled();
  });
  it.each(['recording', 'preparing'] as const)('activation stops %s without taking a photo', (phase) => {
    const handlers = { photo: vi.fn(), startVideo: vi.fn(), stopVideo: vi.fn() };
    const state = { recording: false, preparing: false, disabled: false, [phase]: true };
    performCameraAccessibleAction('activate', state, handlers);
    performCameraAccessibleAction('startVideo', state, handlers);
    expect(handlers.stopVideo).toHaveBeenCalledTimes(1);
    expect(handlers.photo).not.toHaveBeenCalled();
    expect(handlers.startVideo).not.toHaveBeenCalled();
  });
  it('does not capture when disabled or invoke unknown actions', () => {
    const handlers = { photo: vi.fn(), startVideo: vi.fn(), stopVideo: vi.fn() };
    for (const action of ['activate', 'startVideo', 'stopVideo']) {
      performCameraAccessibleAction(action, { recording: false, preparing: false, disabled: true }, handlers);
    }
    performCameraAccessibleAction('unknown', { recording: false, preparing: false, disabled: false }, handlers);
    expect(handlers.photo).not.toHaveBeenCalled();
    expect(handlers.startVideo).not.toHaveBeenCalled();
    expect(handlers.stopVideo).not.toHaveBeenCalled();
  });
  it('adjusts text size by one point and respects both bounds', () => {
    expect(adjustTextSize(20, 'increment', 12, 30)).toBe(21);
    expect(adjustTextSize(20, 'decrement', 12, 30)).toBe(19);
    expect(adjustTextSize(12, 'decrement', 12, 30)).toBe(12);
    expect(adjustTextSize(30, 'increment', 12, 30)).toBe(30);
  });
});

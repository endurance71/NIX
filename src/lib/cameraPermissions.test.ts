import { describe, expect, it, vi } from 'vitest';
import { performCameraPermissionRequest } from './cameraPermissions';

describe('camera permission recovery', () => {
  it('opens Settings after a permanent denial without re-prompting', async () => {
    const actions = { request: vi.fn(), openSettings: vi.fn() };
    await performCameraPermissionRequest({ granted: false, canAskAgain: false }, actions);
    expect(actions.openSettings).toHaveBeenCalledOnce();
    expect(actions.request).not.toHaveBeenCalled();
  });
  it('requests access while a system prompt is available', async () => {
    const actions = { request: vi.fn(), openSettings: vi.fn() };
    await performCameraPermissionRequest({ granted: false, canAskAgain: true }, actions);
    expect(actions.request).toHaveBeenCalledOnce();
    expect(actions.openSettings).not.toHaveBeenCalled();
  });
  it('does not request permissions already granted after returning from Settings', async () => {
    const actions = { request: vi.fn(), openSettings: vi.fn() };
    await performCameraPermissionRequest({ granted: true, canAskAgain: true }, actions);
    expect(actions.request).not.toHaveBeenCalled();
    expect(actions.openSettings).not.toHaveBeenCalled();
  });
});

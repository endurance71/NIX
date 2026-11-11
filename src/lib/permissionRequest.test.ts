import { describe, expect, it, vi } from 'vitest';
import { requestPermissionRespectingRefusal } from './permissionRequest';

describe('requestPermissionRespectingRefusal', () => {
  it('returns granted without asking when access is already on', async () => {
    const request = vi.fn();
    await expect(
      requestPermissionRespectingRefusal(async () => ({ granted: true, canAskAgain: true }), request)
    ).resolves.toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('returns blocked without asking when access was refused earlier', async () => {
    const request = vi.fn();
    await expect(
      requestPermissionRespectingRefusal(async () => ({ granted: false, canAskAgain: false }), request)
    ).resolves.toBe('blocked');
    expect(request).not.toHaveBeenCalled();
  });

  it('returns refused for a fresh "Don\'t Allow", even though iOS cannot ask again afterwards', async () => {
    await expect(
      requestPermissionRespectingRefusal(
        async () => ({ granted: false, canAskAgain: true }),
        async () => ({ granted: false, canAskAgain: false })
      )
    ).resolves.toBe('refused');
  });

  it('returns granted when the user allows in the prompt', async () => {
    await expect(
      requestPermissionRespectingRefusal(
        async () => ({ granted: false, canAskAgain: true }),
        async () => ({ granted: true, canAskAgain: true })
      )
    ).resolves.toBe('granted');
  });
});

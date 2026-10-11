import { describe, expect, it } from 'vitest';
import { decidePushRationale } from './pushRationale';

describe('push rationale offers (NOTIF-12)', () => {
  it('offers once after onboarding', () => {
    expect(decidePushRationale('onboarding', { onboarding: false, afterSend: false }))
      .toEqual({ onboarding: true, afterSend: false });
    expect(decidePushRationale('onboarding', { onboarding: true, afterSend: false })).toBeNull();
  });
  it('offers again after the first successful send when onboarding ended with „Nie teraz”', () => {
    expect(decidePushRationale('after_send', { onboarding: true, afterSend: false }))
      .toEqual({ onboarding: true, afterSend: true });
  });
  it('never offers a second time after a send', () => {
    expect(decidePushRationale('after_send', { onboarding: true, afterSend: true })).toBeNull();
  });
  it('counts a first offer coming from a send as the onboarding offer too', () => {
    expect(decidePushRationale('after_send', { onboarding: false, afterSend: false }))
      .toEqual({ onboarding: true, afterSend: true });
    expect(decidePushRationale('onboarding', { onboarding: true, afterSend: true })).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from './queryKeys';
import {
  createSyncAreaDebouncer,
  finalizeRealtimeChannelUnsubscribe,
  realtimeQueryKeysForArea,
} from './realtimeSyncPolicy';

describe('realtime sync policy', () => {
  afterEach(() => vi.useRealTimers());

  it('odświeża jeden wspólny cache Skrzynki dla zmian NiX', () => {
    expect(realtimeQueryKeysForArea('inbox')).toEqual([queryKeys.inboxNixesBundle, queryKeys.inboxActivityBundle]);
  });

  it('odświeża wszystkie widoki relacji dla zmian zaproszeń', () => {
    expect(realtimeQueryKeysForArea('friends')).toEqual([
      queryKeys.incomingFriendRequests,
      queryKeys.outgoingFriendRequests,
      queryKeys.acceptedFriends,
      queryKeys.currentUserProfile,
    ]);
  });

  it('grupuje serię zdarzeń w jedno odświeżenie i deduplikuje obszary', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const scheduler = createSyncAreaDebouncer(onFlush, 150);

    scheduler.schedule('inbox');
    scheduler.schedule('inbox');
    scheduler.schedule('friends');
    vi.advanceTimersByTime(149);
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect([...onFlush.mock.calls[0][0]]).toEqual(['inbox', 'friends']);
  });

  it('anuluje oczekujące odświeżenie przy czyszczeniu sesji', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const scheduler = createSyncAreaDebouncer(onFlush, 150);
    scheduler.schedule('inbox');
    scheduler.cancel();
    vi.runAllTimers();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('zamyka zasoby kanału po poprawnym unsubscribe podczas unmount', async () => {
    const channel = { teardown: vi.fn() };

    await finalizeRealtimeChannelUnsubscribe(channel, Promise.resolve('ok'));

    expect(channel.teardown).toHaveBeenCalledOnce();
  });

  it('nie wymusza teardown po timeout odpowiedzi serwera', async () => {
    const channel = { teardown: vi.fn() };

    await finalizeRealtimeChannelUnsubscribe(channel, Promise.resolve('timed out'));

    expect(channel.teardown).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from './queryKeys';
import {
  createSyncAreaDebouncer,
  finalizeRealtimeChannelUnsubscribe,
  nextAppSyncTopic,
  realtimeQueryKeysForArea,
  staleAppSyncChannels,
  staleUserBroadcastChannels,
  syncAreaForUserBroadcast,
  USER_BROADCAST_EVENTS,
  userBroadcastTopic,
} from './realtimeSyncPolicy';

describe('realtime sync policy', () => {
  afterEach(() => vi.useRealTimers());

  it('odświeża wspólny cache Skrzynki i otwarte czaty dla zmian NiX', () => {
    expect(realtimeQueryKeysForArea('inbox')).toEqual([
      queryKeys.inboxNixesBundle,
      queryKeys.inboxActivityBundle,
      ['textMessagesWithPeer'],
      ['messageReactionsWithPeer'],
      ['chatNixesWithPeer'],
      queryKeys.nixReactionsAll,
    ]);
  });

  it('reakcje na NiX-y odświeżają tylko swoje zapytanie', () => {
    expect(syncAreaForUserBroadcast('nix_reaction_changed')).toBe('nixReactions');
    expect(realtimeQueryKeysForArea('nixReactions')).toEqual([queryKeys.nixReactionsAll]);
  });

  it('zdarzenia bez filtra per użytkownik nie odświeżają paczki Skrzynki', () => {
    for (const area of ['reactions', 'messageRemoval', 'nixReactions'] as const) {
      expect(realtimeQueryKeysForArea(area)).not.toContainEqual(queryKeys.inboxNixesBundle);
    }
  });

  it('odświeża wszystkie widoki relacji dla zmian zaproszeń', () => {
    expect(realtimeQueryKeysForArea('friends')).toEqual([
      queryKeys.incomingFriendRequests,
      queryKeys.outgoingFriendRequests,
      queryKeys.acceptedFriends,
      queryKeys.currentUserProfiles,
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

  it('każdy montaż dostaje nowy topik, więc szybki remount nie trafia na wychodzący kanał', () => {
    const first = nextAppSyncTopic('user-a', 1_000);
    const second = nextAppSyncTopic('user-a', 1_000);
    expect(first).not.toBe(second);
    expect(first.startsWith('app-sync-user-a-')).toBe(true);
  });

  it('znajduje pozostawione kanały tylko tego użytkownika, także ze starym stałym topikiem', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const channels = [
      { topic: `realtime:app-sync-${userId}` },
      { topic: `realtime:${nextAppSyncTopic(userId)}` },
      { topic: `realtime:${nextAppSyncTopic('other-user')}` },
      { topic: 'realtime:chat-typing' },
    ];
    expect(staleAppSyncChannels(channels, userId)).toEqual(channels.slice(0, 2));
  });

  it('prywatny topik użytkownika zgadza się z polityką RLS realtime.messages', () => {
    expect(userBroadcastTopic('11111111-2222-3333-4444-555555555555')).toBe(
      'user:11111111-2222-3333-4444-555555555555'
    );
  });

  it('mapuje zdarzenia broadcast z triggerów na wąskie obszary czatu', () => {
    expect(syncAreaForUserBroadcast(USER_BROADCAST_EVENTS.reactionChanged)).toBe('reactions');
    expect(syncAreaForUserBroadcast('reaction_changed')).toBe('reactions');
    expect(syncAreaForUserBroadcast(USER_BROADCAST_EVENTS.messagesRemoved)).toBe('messageRemoval');
    expect(syncAreaForUserBroadcast('messages_removed')).toBe('messageRemoval');
    expect(syncAreaForUserBroadcast('INSERT')).toBeNull();
    expect(syncAreaForUserBroadcast('')).toBeNull();
  });

  it('znajduje pozostawione prywatne kanały użytkownika, także poprzedniego konta', () => {
    const channels = [
      { topic: `realtime:${userBroadcastTopic('user-a')}` },
      { topic: `realtime:${userBroadcastTopic('user-b')}` },
      { topic: `realtime:${nextAppSyncTopic('user-a')}` },
      { topic: 'realtime:chat-typing' },
    ];
    expect(staleUserBroadcastChannels(channels)).toEqual(channels.slice(0, 2));
    expect(staleAppSyncChannels(channels, 'user-a')).toEqual([channels[2]]);
  });
});

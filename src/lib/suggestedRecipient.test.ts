import { describe, expect, it } from 'vitest';
import { applySuggestedRecipientOnce, resolveSuggestedRecipientId } from './suggestedRecipient';

describe('resolveSuggestedRecipientId', () => {
  const accepted = ['friend-a', 'friend-b'] as const;

  it('zaznacza zaakceptowanego aktualnego rozmówcę', () => {
    expect(resolveSuggestedRecipientId({ recipientId: 'friend-a', acceptedFriendIds: accepted })).toBe(
      'friend-a'
    );
  });

  it('nie zaznacza niezaakceptowanego recipientId', () => {
    expect(
      resolveSuggestedRecipientId({ recipientId: 'stranger', acceptedFriendIds: accepted })
    ).toBeNull();
  });

  it('brak recipientId zachowuje puste zaznaczenie', () => {
    expect(resolveSuggestedRecipientId({ recipientId: undefined, acceptedFriendIds: accepted })).toBeNull();
    expect(resolveSuggestedRecipientId({ recipientId: '  ', acceptedFriendIds: accepted })).toBeNull();
  });

  it('refetch nie nadpisuje ręcznej zmiany', () => {
    const first = applySuggestedRecipientOnce({
      alreadyApplied: false,
      recipientId: 'friend-a',
      acceptedFriendIds: accepted,
    });
    expect(first).toEqual({ applied: true, selectedId: 'friend-a' });

    const afterManualChange = applySuggestedRecipientOnce({
      alreadyApplied: true,
      recipientId: 'friend-a',
      acceptedFriendIds: accepted,
    });
    expect(afterManualChange).toEqual({ applied: true, selectedId: null });
  });
});

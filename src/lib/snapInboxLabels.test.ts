import { describe, expect, it } from 'vitest';
import { sentLifecycleSegments, type SentSnapLifecycleInput } from './snapInboxLabels';

function snap(partial: Partial<SentSnapLifecycleInput> & Pick<SentSnapLifecycleInput, 'status'>): SentSnapLifecycleInput {
  return {
    viewed_at: null,
    cleaned_at: null,
    ...partial,
  };
}

describe('sentLifecycleSegments', () => {
  it('wynik pusty dla wysłanego nieotwartego', () => {
    expect(sentLifecycleSegments(snap({ status: 'sent', viewed_at: null }))).toEqual([]);
  });

  it('pokazuje Otwarto przy statusie viewed', () => {
    expect(sentLifecycleSegments(snap({ status: 'viewed', viewed_at: null }))).toEqual(['Otwarto']);
  });

  it('pokazuje Otwarto i Usunięte gdy cleaned z viewed_at', () => {
    expect(
      sentLifecycleSegments(
        snap({
          status: 'cleaned',
          viewed_at: '2026-05-01T10:00:00Z',
          cleaned_at: '2026-05-01T10:00:05Z',
        })
      )
    ).toEqual(['Otwarto', 'Usunięte']);
  });

  it('cleanup_failed: Otwarto jeśli było viewed_at', () => {
    expect(
      sentLifecycleSegments(
        snap({
          status: 'cleanup_failed',
          viewed_at: '2026-05-01T10:00:00Z',
        })
      )
    ).toEqual(['Otwarto', 'Błąd usuwania']);
  });

  it('Usunięte gdy cleaned_at nawet przy edge status', () => {
    expect(
      sentLifecycleSegments(
        snap({
          status: 'sent',
          cleaned_at: '2026-05-01T10:00:00Z',
          viewed_at: null,
        })
      )
    ).toEqual(['Usunięte']);
  });
});

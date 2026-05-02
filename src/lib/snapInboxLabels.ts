/** Pola jak w SentSnap (snapService), bez importu klienta Supabase — bezpieczne dla Vitesta w Node. */
export type SentSnapLifecycleInput = {
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  viewed_at: string | null;
  cleaned_at: string | null;
};

/**
 * Segmenty statusu nadawcy między „Wysłane” a godziną (np. Otwarto, Usunięte).
 * Po cleanup `status` jest `cleaned`, ale `viewed_at` pozostaje — pokazujemy oba.
 */
export function sentLifecycleSegments(sent: SentSnapLifecycleInput): string[] {
  const segments: string[] = [];

  const opened = Boolean(sent.viewed_at) || sent.status === 'viewed';
  if (opened) {
    segments.push('Otwarto');
  }

  if (sent.status === 'cleaned' || Boolean(sent.cleaned_at)) {
    segments.push('Usunięte');
  } else if (sent.status === 'cleanup_failed') {
    segments.push('Błąd usuwania');
  }

  return segments;
}

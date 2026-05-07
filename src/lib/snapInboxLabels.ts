/** Pola jak w SentSnap (snapService), bez importu klienta Supabase — bezpieczne dla Vitesta w Node. */

export type SentSnapLifecycleInput = {
  status: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed';
  viewed_at: string | null;
  cleaned_at: string | null;
};

type Translate = (key: 'sentStatus.opened' | 'sentStatus.cleaned' | 'sentStatus.cleanupFailed') => string;

const FALLBACK_LABELS: Record<'sentStatus.opened' | 'sentStatus.cleaned' | 'sentStatus.cleanupFailed', string> = {
  'sentStatus.opened': 'Otwarto',
  'sentStatus.cleaned': 'Usunięte',
  'sentStatus.cleanupFailed': 'Błąd usuwania',
};

/**
 * Segmenty statusu nadawcy między „Wysłane” a godziną (np. Otwarto, Usunięte).
 * Po cleanup `status` jest `cleaned`, ale `viewed_at` pozostaje — pokazujemy oba.
 */
export function sentLifecycleSegments(sent: SentSnapLifecycleInput, translate?: Translate): string[] {
  const segments: string[] = [];
  const t = translate ?? ((key: keyof typeof FALLBACK_LABELS) => FALLBACK_LABELS[key]);

  const opened = Boolean(sent.viewed_at) || sent.status === 'viewed';
  if (opened) {
    segments.push(t('sentStatus.opened'));
  }

  if (sent.status === 'cleaned' || Boolean(sent.cleaned_at)) {
    segments.push(t('sentStatus.cleaned'));
  } else if (sent.status === 'cleanup_failed') {
    segments.push(t('sentStatus.cleanupFailed'));
  }

  return segments;
}

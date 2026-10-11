import { useMemo } from 'react';
import type { TextMessage } from '../types/database.types';
import { useDeadlineClock } from './useDeadlineClock';

/** Clock for hiding expired text messages (DB-2): ticks when the nearest `expires_at` passes. */
export function useTextMessageExpiryClock(messages: readonly Pick<TextMessage, 'expires_at'>[]) {
  const deadlines = useMemo(
    () => messages.flatMap((message) => (message.expires_at ? [Date.parse(message.expires_at)] : [])),
    [messages],
  );
  return useDeadlineClock(deadlines);
}

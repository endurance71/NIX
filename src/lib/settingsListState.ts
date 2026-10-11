export type SettingsListState = 'items' | 'empty' | 'offline' | 'error';

/**
 * Decides what an empty settings list means. A failed query or an offline session without cached
 * data must not read as "you have none".
 */
export function resolveSettingsListState({
  itemCount,
  hasData,
  isError,
  canUseNetworkSession,
}: {
  itemCount: number;
  hasData: boolean;
  isError: boolean;
  canUseNetworkSession: boolean;
}): SettingsListState {
  if (itemCount > 0) return 'items';
  if (!hasData && !canUseNetworkSession) return 'offline';
  if (isError) return 'error';
  return 'empty';
}

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { buildQuickActions } from '../../lib/quickActions';

/** Registers the app icon's quick actions and routes them; renders nothing. */
export function QuickActionsSync() {
  const { t, i18n } = useTranslation();
  useQuickActionRouting();

  useEffect(() => {
    void QuickActions.setItems(buildQuickActions(t)).catch(() => undefined);
  }, [t, i18n.language]);

  return null;
}

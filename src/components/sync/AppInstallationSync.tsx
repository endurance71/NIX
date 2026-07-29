import { useEffect } from 'react';
import { subscribeToAppForeground } from '../../services/pushNotificationService';
import { registerCurrentAppInstallation } from '../../services/appInstallationService';

export function AppInstallationSync() {
  useEffect(() => {
    const register = () => {
      void registerCurrentAppInstallation().catch((error) => {
        console.warn('App installation registration failed', error);
      });
    };
    register();
    return subscribeToAppForeground(register);
  }, []);
  return null;
}

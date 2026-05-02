import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useInboxBadgeCount } from '../../hooks/useInboxBadgeCount';

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { count } = useInboxBadgeCount();

  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="camera.fill" />
        <NativeTabs.Trigger.Label>Kamera</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf="tray.fill" />
        <NativeTabs.Trigger.Label>Skrzynka</NativeTabs.Trigger.Label>
        {count > 0 ? <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

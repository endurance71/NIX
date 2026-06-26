import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useInboxBadgeCount } from '../../hooks/useInboxBadgeCount';

export default function AppTabsLayout() {
  const { colors } = useAppTheme();
  const { count } = useInboxBadgeCount();

  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="camera.fill" md="photo_camera" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf="tray.fill" md="inbox" />
        <NativeTabs.Trigger.Label hidden />
        {count > 0 ? <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="account_circle" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

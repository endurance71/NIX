import { Stack, router } from 'expo-router';
import { iosRoadmapFeatures } from '../../../config/iosRoadmapFeatures';
import {
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useProfileScreen } from '../../../hooks/useProfileScreen';

export default function PrivacySecurityScreen() {
  const vm = useProfileScreen();
  const { colors } = useAppTheme();

  return (
    <>
      <SettingsListScreen loading={vm.profilePending} onRefresh={vm.handleListRefresh}>
        <NativeSettingsSection
          title={vm.t('profile.privacyGroupTitle')}
          footer={
            iosRoadmapFeatures.analytics
              ? vm.t('profile.privateAnalyticsDescription')
              : undefined
          }>
          <NativeSettingsRow
            title={vm.t('profile.privateAccount')}
            icon="lock"
            iconColor={colors.accent}
            switchValue={vm.profileRow?.is_private ?? false}
            onSwitchValueChange={(value) => void vm.handleTogglePrivacy(value)}
            disabled={!vm.canPerformNetworkAction}
            testID="profile-private-account"
          />
          {iosRoadmapFeatures.analytics ? (
            <NativeSettingsRow
              title={vm.t('profile.privateAnalytics')}
              icon="chart"
              iconColor={colors.accent}
              switchValue={vm.analyticsEnabled}
              onSwitchValueChange={(enabled) => void vm.handleAnalyticsToggle(enabled)}
              disabled={!vm.canPerformNetworkAction || vm.analyticsPending}
              testID="profile-product-analytics"
            />
          ) : null}
        </NativeSettingsSection>

        <NativeSettingsSection title={vm.t('profile.securityGroupTitle')}>
          {vm.canChangePassword ? (
            <NativeSettingsRow
              title={vm.t('profile.changePassword')}
              icon="key"
              iconColor={colors.accent}
              showsChevron
              disabled={!vm.canPerformNetworkAction}
              onPress={() => router.push('/(tabs)/profile/change-password')}
              testID="profile-change-password"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.safetyCenterSummary')}
            icon="shield"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/safety')}
            testID="profile-safety"
          />
          {iosRoadmapFeatures.accountData ? (
            <NativeSettingsRow
              title={vm.t('devices.title')}
              icon="devices"
              iconColor={colors.accent}
              showsChevron
              onPress={() => router.push('/(tabs)/profile/devices' as never)}
              testID="profile-devices"
            />
          ) : null}
        </NativeSettingsSection>

        <NativeSettingsSection title={vm.t('profile.dataGroupTitle')}>
          {iosRoadmapFeatures.accountData ? (
            <NativeSettingsRow
              title={vm.t('dataExport.title')}
              icon="download"
              iconColor={colors.accent}
              showsChevron
              onPress={() => router.push('/(tabs)/profile/data-export' as never)}
              testID="profile-data-export"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.privacyPolicy')}
            icon="document"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/privacy-policy')}
            testID="profile-privacy-policy"
          />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>
        {vm.t('profile.privacySectionTitle')}
      </Stack.Screen.Title>
    </>
  );
}

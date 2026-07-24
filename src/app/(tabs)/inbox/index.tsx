import { Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { InboxScreenSurface } from '../../../components/inbox/InboxScreenSurface';
import { HeaderQrButton } from '../../../components/navigation/header-qr-button';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useInboxScreen } from '../../../hooks/useInboxScreen';
import type { InboxRowModel } from '../../../lib/inboxPresentation';

export default function InboxScreen() {
  const vm = useInboxScreen();
  const { colors } = useAppTheme();

  const requestDelete = (row: InboxRowModel) => {
    Alert.alert(
      vm.t('inbox.deleteConfirmTitle', { username: row.username }),
      vm.t('inbox.deleteConfirmMessage'),
      [
        { text: vm.t('common.cancel'), style: 'cancel' },
        {
          text: vm.t('inbox.delete'),
          style: 'destructive',
          onPress: () => void vm.handleDelete(row),
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerTitle: vm.t('inbox.title'),
          headerRight: () => <HeaderQrButton />,
          headerSearchBarOptions: {
            placeholder: vm.t('inbox.searchPlaceholder'),
            hideWhenScrolling: false,
            barTintColor: colors.secondarySystemGroupedBackground,
            textColor: colors.label,
            tintColor: colors.systemBlue,
            ...(Platform.OS === 'android'
              ? {
                  hintTextColor: colors.secondaryLabel,
                  headerIconColor: colors.secondaryLabel,
                }
              : {}),
            onChangeText: (_e) => {
              // TODO: Implement search filter in VM if needed
            },
          },
        }}
      />
      <InboxScreenSurface vm={vm} onRequestDelete={requestDelete} />
    </>
  );
}

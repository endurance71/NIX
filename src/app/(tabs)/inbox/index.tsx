import { Alert, Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { InboxScreenSurface } from '../../../components/inbox/InboxScreenSurface';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useInboxScreen } from '../../../hooks/useInboxScreen';
import type { InboxRowModel, UploadRowAction } from '../../../lib/inboxPresentation';
import { OfflineStatusBanner } from '../../../components/auth/OfflineStatusBanner';
import { resolveAppIconName } from '../../../theme/app-icons';
import { tap } from '../../../lib/haptics';

export default function InboxScreen() {
  return <OnlineInboxScreen />;
}

function OnlineInboxScreen() {
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

  const requestBlock = (row: InboxRowModel) => {
    Alert.alert(vm.t('viewer.blockConfirmTitle'), vm.t('viewer.blockConfirmMessage'), [
      { text: vm.t('common.cancel'), style: 'cancel' },
      {
        text: vm.t('viewer.blockAction'),
        style: 'destructive',
        onPress: () => void vm.handleBlock(row),
      },
    ]);
  };

  const runUploadAction = (row: InboxRowModel, action: UploadRowAction) => {
    void vm.handleUploadAction(row, action);
  };

  const requestUploadAction = (row: InboxRowModel, action: UploadRowAction) => {
    const upload = row.upload;
    if (!upload) return;
    const isShared = upload.sharedRecipientCount > 1;
    const needsConfirmation = isShared || action === 'cancel';
    if (!needsConfirmation) {
      runUploadAction(row, action);
      return;
    }

    const actionLabel = action === 'pause'
      ? vm.t('inbox.uploadPause')
      : action === 'resume'
        ? vm.t('inbox.uploadResume')
        : action === 'retry'
          ? vm.t('inbox.uploadRetry')
          : vm.t('inbox.uploadCancel');
    const title = isShared
      ? vm.t('inbox.uploadSharedActionTitle')
      : vm.t('inbox.uploadCancelTitle');
    const message = isShared
      ? vm.t('inbox.uploadSharedActionMessage', { count: upload.sharedRecipientCount })
      : vm.t('inbox.uploadCancelMessage');

    Alert.alert(title, message, [
      { text: vm.t('common.cancel'), style: 'cancel' },
      {
        text: actionLabel,
        style: action === 'cancel' ? 'destructive' : 'default',
        onPress: () => runUploadAction(row, action),
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerTitle: vm.t('inbox.title'),
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
            onChangeText: (event) => vm.handleSearchChange(event.nativeEvent.text),
            onSearchButtonPress: vm.handleSearchEnd,
            onCancelButtonPress: () => vm.handleSearchChange(''),
          },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('compose')}
          accessibilityLabel={vm.t('inbox.composeChatA11y')}
          onPress={() => {
            tap('light');
            router.push('/new-chat');
          }}
        />
      </Stack.Toolbar>
      <View style={{ flex: 1 }}>
        <OfflineStatusBanner />
        <InboxScreenSurface
          vm={vm}
          onRequestDelete={requestDelete}
          onRequestBlock={requestBlock}
          onRequestUploadAction={requestUploadAction}
        />
      </View>
    </>
  );
}

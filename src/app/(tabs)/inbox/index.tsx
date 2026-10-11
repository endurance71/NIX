import { useRef } from 'react';
import { Alert, View } from 'react-native';
import { Stack, router, useNavigation } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { InboxScreenSurface } from '../../../components/inbox/InboxScreenSurface';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useInboxScreen } from '../../../hooks/useInboxScreen';
import type { InboxRowModel, UploadRowAction } from '../../../lib/inboxPresentation';
import { OfflineStatusBanner } from '../../../components/auth/OfflineStatusBanner';
import { resolveAppIconName } from '../../../theme/app-icons';
import { CHAT_PEER_REPORT_REASONS } from '../../../components/chat/ChatHeaderMenu';

export default function InboxScreen() {
  return <OnlineInboxScreen />;
}

function OnlineInboxScreen() {
  const vm = useInboxScreen();
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const searchBarRef = useRef<SearchBarCommands>(null);

  // The search button's close (X) on iOS 26 dismisses the field without the cancel or text events,
  // only a blur. A blur while the inbox stays on screen therefore ends the search; one caused by
  // opening a conversation from the results keeps it.
  const handleSearchBlur = () => {
    if (!navigation.isFocused()) return;
    searchBarRef.current?.clearText();
    vm.handleSearchChange('');
  };

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
      ],
    );
  };

  const requestBlock = (row: InboxRowModel) => {
    Alert.alert(
      vm.t('friends.blockConfirmTitle', { username: row.username }),
      vm.t('viewer.blockConfirmMessage'),
      [
        { text: vm.t('common.cancel'), style: 'cancel' },
        {
          text: vm.t('chat.block'),
          style: 'destructive',
          onPress: () => void vm.handleBlock(row),
        },
      ],
    );
  };

  const requestReport = (row: InboxRowModel) => {
    Alert.alert(
      vm.t('inbox.reportPersonTitle'),
      undefined,
      [
        ...CHAT_PEER_REPORT_REASONS.map((reason) => ({
          text: vm.t(`profile.reportReason.${reason}`),
          onPress: () => void vm.handleReport(row, reason),
        })),
        { text: vm.t('common.cancel'), style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const requestMute = (row: InboxRowModel) => {
    Alert.alert(vm.t('chat.muteTitle'), undefined, [
      {
        text: vm.t('chat.mute1h'),
        onPress: () => void vm.handleSetMute(row, '1h'),
      },
      {
        text: vm.t('chat.mute24h'),
        onPress: () => void vm.handleSetMute(row, '24h'),
      },
      {
        text: vm.t('chat.muteForever'),
        onPress: () => void vm.handleSetMute(row, 'forever'),
      },
      { text: vm.t('common.cancel'), style: 'cancel' },
    ]);
  };

  const openCompose = () => {
    router.push('/new-chat');
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

    const actionLabel =
      action === 'pause'
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
      ? vm.t('inbox.uploadSharedActionMessage', {
          count: upload.sharedRecipientCount,
        })
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
            ref: searchBarRef,
            // A native search button in the navigation bar next to Compose (iOS 26); it expands into
            // the field on tap. Toolbar integration stays off: on a tab's root screen a UIKit bug
            // hides a search field folded into the bottom toolbar.
            placement: 'integratedButton',
            allowToolbarIntegration: false,
            hideWhenScrolling: false,
            barTintColor: colors.secondarySystemGroupedBackground,
            textColor: colors.label,
            tintColor: colors.systemBlue,
            onChangeText: (event) => vm.handleSearchChange(event.nativeEvent.text),
            onSearchButtonPress: vm.handleSearchEnd,
            onCancelButtonPress: () => vm.handleSearchChange(''),
            onBlur: handleSearchBlur,
          },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('compose')}
          accessibilityLabel={vm.t('inbox.composeChatA11y')}
          onPress={openCompose}
        />
      </Stack.Toolbar>
      <View style={{ flex: 1 }}>
        <OfflineStatusBanner />
        <InboxScreenSurface
          vm={vm}
          onRequestDelete={requestDelete}
          onRequestBlock={requestBlock}
          onRequestReport={requestReport}
          onRequestMute={requestMute}
          onCompose={openCompose}
          onRequestUploadAction={requestUploadAction}
        />
      </View>
    </>
  );
}

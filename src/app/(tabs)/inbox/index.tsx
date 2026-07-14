import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { InboxScreenSurface } from '../../../components/inbox/InboxScreenSurface';
import { useInboxScreen } from '../../../hooks/useInboxScreen';
import type { InboxRowModel } from '../../../lib/inboxPresentation';

export default function InboxScreen() {
  const vm = useInboxScreen();

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
      <InboxScreenSurface vm={vm} onRequestDelete={requestDelete} />
      <Stack.Screen.Title>{vm.t('inbox.title')}</Stack.Screen.Title>
    </>
  );
}

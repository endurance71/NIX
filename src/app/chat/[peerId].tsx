import { useLocalSearchParams, Stack } from 'expo-router';
import { useChatScreen } from '../../hooks/useChatScreen';
import { ChatScreenSurface } from '../../components/chat/ChatScreenSurface';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function ChatScreen() {
  const { peerId } = useLocalSearchParams<{ peerId: string }>();
  const vm = useChatScreen(peerId ?? '');
  const { colors } = useAppTheme();

  const title = vm.peerProfile
    ? vm.peerProfile.display_name || `@${vm.peerProfile.username}`
    : vm.t('chat.title');

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitleVisible: false,
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.label, fontWeight: '700' },
        }}
      />
      <ChatScreenSurface vm={vm} />
    </>
  );
}

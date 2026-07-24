import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useChatScreen } from '../../hooks/useChatScreen';
import { ChatScreenSurface } from '../../components/chat/ChatScreenSurface';
import { AvatarCircle } from '../../components/ui/avatar-circle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';

function ChatHeaderTitle({
  title,
  avatarUrl,
  avatarPath,
  avatarEmoji,
  fallbackInitial,
}: {
  title: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  avatarEmoji: string | null;
  fallbackInitial: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.headerTitle} accessibilityRole="header">
      <AvatarCircle
        size={28}
        url={avatarUrl}
        storagePath={avatarPath}
        emoji={avatarEmoji}
        fallbackInitial={fallbackInitial}
      />
      <Text style={[styles.headerName, { color: colors.label }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const { peerId } = useLocalSearchParams<{ peerId: string }>();
  const vm = useChatScreen(peerId ?? '');
  const { colors } = useAppTheme();

  const displayName = vm.peerProfile?.display_name?.trim() || null;
  const username = vm.peerProfile?.username ? `@${vm.peerProfile.username}` : null;
  const title = displayName || username || vm.t('chat.title');
  const fallbackInitial = (displayName || vm.peerProfile?.username || '?').charAt(0);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.accent,
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackground: () => null,
          headerTitleAlign: 'center',
          headerTitle: () => (
            <ChatHeaderTitle
              title={title}
              avatarUrl={vm.peerAvatarUrl}
              avatarPath={vm.peerAvatarPath}
              avatarEmoji={vm.peerProfile?.avatar_emoji ?? null}
              fallbackInitial={fallbackInitial}
            />
          ),
        }}
      />
      <ChatScreenSurface vm={vm} />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 220,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
    flexShrink: 1,
  },
});

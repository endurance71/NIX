import { Alert, Platform, Pressable, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useChatScreen } from '../../hooks/useChatScreen';
import { CHAT_PEER_REPORT_REASONS } from '../../components/chat/ChatHeaderMenu';
import { ChatScreenSurface } from '../../components/chat/ChatScreenSurface';
import { AvatarCircle } from '../../components/ui/avatar-circle';
import { AppIcon } from '../../components/ui/app-icon';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { APP_FONT_FAMILY } from '../../theme/typography';

/** Matches iOS liquid-glass back control diameter in the nav bar. */
const HEADER_AVATAR_SIZE = 36;

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
        size={HEADER_AVATAR_SIZE}
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
  const confirmUsername = vm.peerProfile?.username ?? 'user';

  const requestBlock = () => {
    Alert.alert(vm.t('viewer.blockConfirmTitle'), vm.t('viewer.blockConfirmMessage'), [
      { text: vm.t('common.cancel'), style: 'cancel' },
      {
        text: vm.t('chat.block'),
        style: 'destructive',
        onPress: () => void vm.handleBlockPeer(),
      },
    ]);
  };

  const requestDelete = () => {
    Alert.alert(
      vm.t('inbox.deleteConfirmTitle', { username: confirmUsername }),
      vm.t('inbox.deleteConfirmMessage'),
      [
        { text: vm.t('common.cancel'), style: 'cancel' },
        {
          text: vm.t('chat.delete'),
          style: 'destructive',
          onPress: () => void vm.handleDeleteConversation(),
        },
      ]
    );
  };

  const openFallbackMenu = () => {
    Alert.alert(vm.t('chat.moreA11y'), undefined, [
      {
        text: vm.t('chat.report'),
        onPress: () => {
          Alert.alert(
            vm.t('viewer.reportReasonTitle'),
            undefined,
            [
              ...CHAT_PEER_REPORT_REASONS.map((reason) => ({
                text: vm.t(`profile.reportReason.${reason}`),
                onPress: () => void vm.handleReportPeer(reason),
              })),
              { text: vm.t('common.cancel'), style: 'cancel' as const },
            ],
            { cancelable: true }
          );
        },
      },
      {
        text: vm.t('chat.block'),
        style: 'destructive',
        onPress: requestBlock,
      },
      {
        text: vm.t('chat.delete'),
        style: 'destructive',
        onPress: requestDelete,
      },
      { text: vm.t('common.cancel'), style: 'cancel' },
    ]);
  };

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
          headerTitleAlign: 'left',
          headerTitle: () => (
            <ChatHeaderTitle
              title={title}
              avatarUrl={vm.peerAvatarUrl}
              avatarPath={vm.peerAvatarPath}
              avatarEmoji={vm.peerProfile?.avatar_emoji ?? null}
              fallbackInitial={fallbackInitial}
            />
          ),
          ...(Platform.OS !== 'ios'
            ? {
                headerRight: () => (
                  <Pressable
                    onPress={openFallbackMenu}
                    accessibilityLabel={vm.t('chat.moreA11y')}
                    accessibilityRole="button"
                    hitSlop={10}
                    style={styles.androidMore}>
                    <AppIcon name="more" size={APP_ICON_SIZE.xl} color={colors.accent} />
                  </Pressable>
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon={resolveAppIconName('more')} accessibilityLabel={vm.t('chat.moreA11y')}>
            <Stack.Toolbar.Menu title={vm.t('chat.report')} icon={resolveAppIconName('warning')}>
              {CHAT_PEER_REPORT_REASONS.map((reason) => (
                <Stack.Toolbar.MenuAction
                  key={reason}
                  onPress={() => void vm.handleReportPeer(reason)}>
                  {vm.t(`profile.reportReason.${reason}`)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.MenuAction icon={resolveAppIconName('block')} destructive onPress={requestBlock}>
              {vm.t('chat.block')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon={resolveAppIconName('trash')} destructive onPress={requestDelete}>
              {vm.t('chat.delete')}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <ChatScreenSurface vm={vm} />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 280,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  androidMore: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

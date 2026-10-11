import { useCallback, useMemo } from 'react';
import { Alert, Pressable, View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, Stack, type Href } from 'expo-router';
import { useChatScreen } from '../../hooks/useChatScreen';
import { CHAT_PEER_REPORT_REASONS } from '../../components/chat/ChatHeaderMenu';
import { ChatScreenSurface } from '../../components/chat/ChatScreenSurface';
import { AvatarCircle } from '../../components/ui/avatar-circle';
import { AppIcon } from '../../components/ui/app-icon';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import { iosRoadmapFeatures } from '../../config/iosRoadmapFeatures';
import { useAuth } from '../../hooks/useAuth';
import { useStableHandler } from '../../hooks/useStableHandler';
import { OfflineStatusBanner } from '../../components/auth/OfflineStatusBanner';
import { PeerStreakBadge, usePeerFriendshipBadgeText } from '../../components/friend/StreakBadge';


const renderNoHeaderBackground = () => null;

/** Matches iOS liquid-glass back control diameter in the nav bar. */
const HEADER_AVATAR_SIZE = 36;

/** Chrome text: grows with Dynamic Type only this much, so the name never crowds the toolbar. */
const HEADER_MAX_FONT_SCALE = 1.3;

function ChatHeaderTitle({
  peerId,
  title,
  avatarUrl,
  avatarPath,
  avatarEmoji,
  fallbackInitial,
  muted,
  typingLabel,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  peerId: string | null;
  title: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  avatarEmoji: string | null;
  fallbackInitial: string;
  muted: boolean;
  /** „pisze…” while the peer is typing, otherwise null. */
  typingLabel: string | null;
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  // One VoiceOver element: the avatar (initial / emoji) and the bell are not read separately.
  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={6}
      style={({ pressed }) => [styles.headerTitle, pressed ? styles.headerTitlePressed : null]}>
      <AvatarCircle
        size={HEADER_AVATAR_SIZE}
        url={avatarUrl}
        storagePath={avatarPath}
        emoji={avatarEmoji}
        fallbackInitial={fallbackInitial}
      />
      <View style={styles.headerText}>
        <View style={styles.headerNameRow}>
          <Text
            style={[styles.headerName, { color: colors.label }]}
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}>
            {title}
          </Text>
          {/* Spoken through the header's combined label. */}
          <PeerStreakBadge peerId={peerId} decorative maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} />
          {muted ? (
            <AppIcon name="notificationOff" size={APP_ICON_SIZE.xs} color={colors.secondaryLabel} />
          ) : null}
        </View>
        {typingLabel ? (
          <Text
            style={[styles.headerSubtitle, { color: colors.secondaryLabel }]}
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}>
            {typingLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ChatScreen() {
  const { peerId } = useLocalSearchParams<{ peerId: string }>();
  const vm = useChatScreen(peerId ?? '');
  const { colors } = useAppTheme();
  const { isOfflineAuthenticated } = useAuth();

  const displayName = vm.peerProfile?.display_name?.trim() || null;
  const username = vm.peerProfile?.username ? `@${vm.peerProfile.username}` : null;
  const title = displayName || username || vm.t('chat.title');
  const fallbackInitial = (displayName || vm.peerProfile?.username || '?').charAt(0);
  const confirmUsername = vm.peerProfile?.username ?? null;

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
      confirmUsername
        ? vm.t('inbox.deleteConfirmTitle', { username: confirmUsername })
        : vm.t('inbox.deleteConfirmTitleGeneric'),
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

  // Stable header options (PERF-10): `Stack.Screen` calls `setOptions` whenever this object
  // changes, so it is rebuilt only when what the header shows changes.
  const { t, peerAvatarUrl, peerAvatarPath, isMuted, peerTyping } = vm;
  const avatarEmoji = vm.peerProfile?.avatar_emoji ?? null;
  const openPeerProfile = useStableHandler(() => {
    if (!peerId) return;
    // The friend detail route is added separately; cast so typed routes do not depend on it.
    router.push({ pathname: '/friend/[id]', params: { id: peerId } } as unknown as Href);
  });
  const typingLabel = peerTyping ? t('chat.typing') : null;
  const friendshipBadge = usePeerFriendshipBadgeText(peerId);
  const headerA11yLabel = [
    title,
    friendshipBadge?.accessibilityLabel ?? null,
    isMuted ? t('chat.mutedA11y') : null,
    typingLabel,
  ]
    .filter(Boolean)
    .join(', ');
  const headerA11yHint = t('chat.headerProfileHint');
  const headerTitle = useCallback(
    () => (
      <ChatHeaderTitle
        peerId={peerId ?? null}
        title={title}
        avatarUrl={peerAvatarUrl}
        avatarPath={peerAvatarPath}
        avatarEmoji={avatarEmoji}
        fallbackInitial={fallbackInitial}
        muted={isMuted}
        typingLabel={typingLabel}
        accessibilityLabel={headerA11yLabel}
        accessibilityHint={headerA11yHint}
        onPress={openPeerProfile}
      />
    ),
    [
      avatarEmoji,
      fallbackInitial,
      headerA11yHint,
      headerA11yLabel,
      isMuted,
      openPeerProfile,
      peerAvatarPath,
      peerId,
      peerAvatarUrl,
      title,
      typingLabel,
    ],
  );
  const headerOptions = useMemo(
    () => ({
      headerBackButtonDisplayMode: 'minimal' as const,
      headerTintColor: colors.accent,
      headerTransparent: !isOfflineAuthenticated,
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: isOfflineAuthenticated ? colors.systemBackground : 'transparent',
      },
      headerBackground: isOfflineAuthenticated ? undefined : renderNoHeaderBackground,
      headerTitle,
    }),
    [colors.accent, colors.systemBackground, headerTitle, isOfflineAuthenticated],
  );

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon={resolveAppIconName('more')} accessibilityLabel={vm.t('chat.moreA11y')}>
          {iosRoadmapFeatures.communicationControls ? (
            vm.isMuted ? (
              <Stack.Toolbar.MenuAction
                icon={resolveAppIconName('notification')}
                onPress={() => void vm.handleSetMute('off')}>
                {vm.t('chat.unmute')}
              </Stack.Toolbar.MenuAction>
            ) : (
              <Stack.Toolbar.Menu title={vm.t('chat.mute')} icon={resolveAppIconName('notificationOff')}>
                <Stack.Toolbar.MenuAction onPress={() => void vm.handleSetMute('1h')}>
                  {vm.t('chat.mute1h')}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction onPress={() => void vm.handleSetMute('24h')}>
                  {vm.t('chat.mute24h')}
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction onPress={() => void vm.handleSetMute('forever')}>
                  {vm.t('chat.muteForever')}
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            )
          ) : null}
          <Stack.Toolbar.Menu title={vm.t('chat.report')} icon={resolveAppIconName('report')}>
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
            {vm.t('inbox.deleteConversation')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <View style={{ flex: 1, backgroundColor: colors.systemBackground }}>
        <OfflineStatusBanner />
        <ChatScreenSurface vm={vm} />
      </View>
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
  headerTitlePressed: {
    opacity: 0.6,
  },
  headerText: {
    flexShrink: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerName: {
    ...typography.headline,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    ...typography.caption,
  },
});

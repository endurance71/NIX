import { memo, useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Circle,
  ContentUnavailableView,
  ContextMenu,
  Divider,
  HStack,
  Image,
  List,
  Menu,
  ProgressView,
  RNHostView,
  Section,
  SwipeActions,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityHidden,
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  multilineTextAlignment,
  opacity,
  padding,
  progressViewStyle,
  refreshable,
  scrollContentBackground,
  scrollEdgeEffectStyle,
  shapes,
  tint,
  monospacedDigit,
  type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers';
import { messageStatusColor, messageStatusPresentation } from '../../lib/messageStatus';
import { MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import type {
  InboxRowModel,
  RecipientUploadPhase,
  UploadRowAction,
} from '../../lib/inboxPresentation';
import {
  buildInboxRowAccessibilityLabel,
  hasInboxRowMenu,
  resolveInboxRowMenu,
  uploadPhaseTone,
  type ConversationMuteDuration,
  type InboxRowMenu,
} from '../../lib/inboxRowMenu';
import type { InboxScreenViewModel } from '../../hooks/useInboxScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useStableHandler } from '../../hooks/useStableHandler';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { AppHost } from '../ui/app-host';
import { AvatarCircle } from '../ui/avatar-circle';
import { IncomingInviteRow } from './IncomingInviteRow';
import { FriendshipBadgeLabel } from '../friend/FriendshipBadgeLabel';
import {
  friendshipBadgeAccessibilityLabel,
  type FriendshipBadge,
} from '../../lib/friendStreaks';

const MESSAGE_AVATAR_SIZE = 52;
const INVITE_AVATAR_SIZE = 44;
const UNREAD_DOT_SIZE = 10;
const supportsContentUnavailableView = Number.parseFloat(String(Platform.Version)) >= 17;

type InboxScreenSurfaceProps = {
  vm: InboxScreenViewModel;
  onRequestDelete: (row: InboxRowModel) => void;
  onRequestBlock: (row: InboxRowModel) => void;
  onRequestReport: (row: InboxRowModel) => void;
  /** Swipe "Mute": asks for the duration (the context menu offers durations inline). */
  onRequestMute: (row: InboxRowModel) => void;
  onRequestUploadAction: (row: InboxRowModel, action: UploadRowAction) => void;
  onCompose: () => void;
};

type Translate = InboxScreenViewModel['t'];

const UPLOAD_PHASE_ICONS: Record<RecipientUploadPhase, AppIconName | null> = {
  failed: 'warningFill',
  waiting_network: 'offline',
  retry_scheduled: 'retry',
  paused: 'pauseCircleFill',
  completed: 'checkCircleFill',
  preparing: null,
  uploading: null,
  confirming: null,
};

function useUploadPhaseColor(phase: RecipientUploadPhase | undefined) {
  const { colors } = useAppTheme();
  if (!phase) return null;
  switch (uploadPhaseTone(phase)) {
    case 'danger':
      return colors.destructive;
    case 'success':
      return colors.success;
    case 'passive':
      return colors.secondaryLabel;
    case 'active':
      return colors.accent;
  }
}

function avatarView({
  size,
  url,
  storagePath,
  emoji,
  fallbackInitial,
}: {
  size: number;
  url: string | null;
  storagePath: string | null;
  emoji: string | null;
  fallbackInitial: string;
}) {
  return (
    <RNHostView matchContents>
      <View
        collapsable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size }}>
        <AvatarCircle
          size={size}
          url={url}
          storagePath={storagePath}
          emoji={emoji}
          fallbackInitial={fallbackInitial}
        />
      </View>
    </RNHostView>
  );
}

function reactionGlyphFor(reaction: { emoji: keyof typeof MESSAGE_REACTION_GLYPHS } | null) {
  return reaction ? MESSAGE_REACTION_GLYPHS[reaction.emoji] : null;
}

function rowSubtitle(row: InboxRowModel, t: Translate, reactionGlyph: string | null = null) {
  if (row.upload) {
    switch (row.upload.phase) {
      case 'preparing':
        return t('inbox.uploadPreparing');
      case 'uploading':
        // The percent is shown once, next to the ring (SEND-14).
        return t('inbox.uploadActive');
      case 'confirming':
        return t('inbox.uploadConfirming');
      case 'waiting_network':
        return t('inbox.uploadWaitingNetwork');
      case 'retry_scheduled':
        return t('inbox.uploadRetryScheduled');
      case 'paused':
        return t('inbox.uploadPaused');
      case 'failed':
        return t('inbox.uploadAttention');
      case 'completed':
        return t('inbox.uploadCompleted');
    }
  }
  // One Snapchat-style vocabulary for every row: Delivered / Opened / Replayed for what I sent,
  // New NiX / New message / Received for what I got (see messageStatus).
  const status = t(messageStatusPresentation(row.messageStatus, row.messageKind).labelKey);
  // The peer's reaction to my NiX rides along with its status, e.g. "Otwarto · ❤️".
  return reactionGlyph ? `${status} · ${reactionGlyph}` : status;
}

function UploadAccessory({ row, t }: { row: InboxRowModel; t: Translate }) {
  const { colors } = useAppTheme();
  const upload = row.upload;
  const color = useUploadPhaseColor(upload?.phase) ?? colors.accent;
  if (!upload) return null;
  const percent = `${Math.round(upload.progress * 100)}%`;
  const icon = UPLOAD_PHASE_ICONS[upload.phase];
  // Moderation has no measurable progress: an indeterminate spinner instead of a ring stuck at 97%.
  const indeterminate = upload.phase === 'confirming';
  const showPercent = icon === null && !indeterminate;
  // The label names the phase only, so VoiceOver is not re-announced on every progress tick; the
  // value is rounded to 10% steps for the same reason.
  const accessibilityModifiers = showPercent
    ? [
        accessibilityLabel(rowSubtitle(row, t)),
        accessibilityValue(`${Math.floor(upload.progress * 10) * 10}%`),
      ]
    : [accessibilityLabel(rowSubtitle(row, t))];

  return (
    <HStack
      alignment="center"
      spacing={6}
      modifiers={[layoutPriority(2), ...accessibilityModifiers]}>
      {icon ? (
        <Image
          systemName={resolveAppIconName(icon)}
          size={18}
          color={color}
          modifiers={[accessibilityHidden()]}
        />
      ) : (
        <ProgressView
          value={indeterminate ? undefined : upload.progress}
          modifiers={[
            progressViewStyle('circular'),
            frame({ width: 20, height: 20 }),
            tint(color),
            accessibilityHidden(),
          ]}
        />
      )}
      {showPercent ? (
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'caption', weight: 'semibold' }),
            monospacedDigit(),
            foregroundStyle(color),
            lineLimit(1),
          ]}>
          {percent}
        </Text>
      ) : null}
    </HStack>
  );
}

function MessageSubtitle({ row, label }: { row: InboxRowModel; label: string }) {
  const { colors } = useAppTheme();
  const uploadColor = useUploadPhaseColor(row.upload?.phase);
  if (!row.upload) {
    const presentation = messageStatusPresentation(row.messageStatus, row.messageKind);
    const color = messageStatusColor(presentation.tone, colors);
    return (
      <HStack alignment="center" spacing={6}>
        <Image
          systemName={resolveAppIconName(presentation.icon)}
          size={APP_ICON_SIZE.xs}
          color={color}
          modifiers={[accessibilityHidden()]}
        />
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'subheadline', weight: presentation.emphasized ? 'semibold' : 'regular' }),
            foregroundStyle(
              presentation.emphasized || presentation.tone === 'danger'
                ? color
                : { type: 'hierarchical', style: 'secondary' },
            ),
            lineLimit(1),
          ]}>
          {label}
        </Text>
      </HStack>
    );
  }
  return (
    <Text
      modifiers={[
        font({ design: 'rounded', textStyle: 'subheadline' }),
        foregroundStyle(
          row.status === 'cleanupFailed'
            ? colors.destructive
            : (uploadColor ?? { type: 'hierarchical', style: 'secondary' }),
        ),
        lineLimit(1),
      ]}>
      {label}
    </Text>
  );
}

function MessageAccessory({
  row,
  busy,
  pinned,
  muted,
  t,
}: {
  row: InboxRowModel;
  busy: boolean;
  pinned: boolean;
  muted: boolean;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  if (busy) return <ProgressView modifiers={[accessibilityLabel(t('common.loading'))]} />;
  if (row.upload) return <UploadAccessory row={row} t={t} />;
  return (
    <HStack alignment="center" spacing={4} modifiers={[layoutPriority(2), accessibilityHidden()]}>
      {muted ? (
        <Image
          systemName={resolveAppIconName('notificationOff')}
          size={APP_ICON_SIZE.xs}
          color={colors.secondaryLabel}
        />
      ) : null}
      {pinned ? (
        <Image systemName={resolveAppIconName('pin')} size={APP_ICON_SIZE.xs} color={colors.secondaryLabel} />
      ) : null}
      <Text
        modifiers={[
          font({ design: 'rounded', textStyle: 'subheadline' }),
          foregroundStyle(
            row.unread ? colors.systemBlue : { type: 'hierarchical', style: 'secondary' },
          ),
          lineLimit(1),
        ]}>
        {row.timestampLabel}
      </Text>
      <Image
        systemName={resolveAppIconName('chevronRight')}
        size={APP_ICON_SIZE.xs}
        color={colors.tertiaryLabel}
      />
    </HStack>
  );
}

function MessageRowContent({
  row,
  avatarUrl,
  busy,
  pinned,
  muted,
  friendshipBadge,
  reactionGlyph,
  t,
}: {
  row: InboxRowModel;
  avatarUrl: string | null;
  busy: boolean;
  pinned: boolean;
  muted: boolean;
  friendshipBadge: FriendshipBadge | null;
  reactionGlyph: string | null;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const label = rowSubtitle(row, t, reactionGlyph);

  return (
    <HStack
      alignment="center"
      spacing={10}
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: 52, alignment: 'leading' }),
        contentShape(shapes.rectangle()),
      ]}>
      {/* Unread dot before the avatar, like Messages; the slot is always reserved so names align. */}
      <Circle
        modifiers={[
          frame({ width: UNREAD_DOT_SIZE, height: UNREAD_DOT_SIZE }),
          foregroundStyle(colors.systemBlue),
          opacity(row.unread ? 1 : 0),
          accessibilityHidden(),
        ]}
      />
      {avatarView({
        size: MESSAGE_AVATAR_SIZE,
        url: avatarUrl,
        storagePath: row.avatarStoragePath,
        emoji: row.avatarEmoji,
        fallbackInitial: row.username,
      })}

      <VStack
        alignment="leading"
        spacing={3}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), layoutPriority(1)]}>
        {/* Streak / best-friend glyphs follow the name; the row label already speaks them. */}
        <HStack alignment="center" spacing={6}>
          <Text
            modifiers={[
              font({ design: 'rounded', textStyle: 'body', weight: row.unread ? 'semibold' : 'regular' }),
              foregroundStyle({ type: 'hierarchical', style: 'primary' }),
              lineLimit(1),
            ]}>
            {row.display_name || `@${row.username}`}
          </Text>
          <FriendshipBadgeLabel badge={friendshipBadge} decorative />
        </HStack>
        <MessageSubtitle row={row} label={label} />
      </VStack>

      <MessageAccessory row={row} busy={busy} pinned={pinned} muted={muted} t={t} />
    </HStack>
  );
}

function selectPrimaryUploadAction(upload: InboxRowModel['upload']): UploadRowAction | null {
  if (upload?.actions.resumeJobIds.length) return 'resume';
  if (upload?.actions.retryJobIds.length) return 'retry';
  if (upload?.actions.pauseJobIds.length) return 'pause';
  return null;
}

function MessageLeadingSwipeActions({
  row,
  pinned,
  muted,
  menu,
  onUploadAction,
  onTogglePin,
  onToggleMute,
  t,
}: {
  row: InboxRowModel;
  pinned: boolean;
  muted: boolean;
  menu: InboxRowMenu;
  onUploadAction: (action: UploadRowAction) => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const upload = row.upload;
  const primaryUploadAction = selectPrimaryUploadAction(upload);

  // A row that is still sending keeps its upload controls on the leading edge.
  if (upload && (primaryUploadAction || upload.actions.cancelJobIds.length > 0)) {
    const primaryUploadLabel =
      primaryUploadAction === 'resume'
        ? t('inbox.uploadResume')
        : primaryUploadAction === 'retry'
          ? t('inbox.uploadRetry')
          : t('inbox.uploadPause');
    return (
      <SwipeActions.Actions edge="leading" allowsFullSwipe={false}>
        {primaryUploadAction ? (
          <Button
            label={primaryUploadLabel}
            onPress={() => onUploadAction(primaryUploadAction)}
            modifiers={[tint(primaryUploadAction === 'retry' ? colors.warning : colors.systemBlue)]}
          />
        ) : null}
        {upload.actions.cancelJobIds.length > 0 ? (
          <Button
            label={t('inbox.uploadCancel')}
            onPress={() => onUploadAction('cancel')}
            modifiers={[tint(colors.destructive)]}
          />
        ) : null}
      </SwipeActions.Actions>
    );
  }

  if (!menu.pin && !menu.mute) return null;
  return (
    <SwipeActions.Actions edge="leading" allowsFullSwipe={false}>
      {menu.pin ? (
        <Button
          label={pinned ? t('inbox.unpin') : t('inbox.pin')}
          systemImage={resolveAppIconName(pinned ? 'unpin' : 'pin')}
          onPress={onTogglePin}
          modifiers={[tint(colors.accent)]}
        />
      ) : null}
      {menu.mute ? (
        <Button
          label={muted ? t('chat.unmute') : t('chat.mute')}
          systemImage={resolveAppIconName(muted ? 'notification' : 'notificationOff')}
          onPress={onToggleMute}
          modifiers={[tint(colors.systemGray)]}
        />
      ) : null}
    </SwipeActions.Actions>
  );
}

function MessageContextMenuItems({
  menu,
  pinned,
  muted,
  onTogglePin,
  onSetMute,
  onMarkRead,
  onReport,
  onBlock,
  onDelete,
  t,
}: {
  menu: InboxRowMenu;
  pinned: boolean;
  muted: boolean;
  onTogglePin: () => void;
  onSetMute: (duration: ConversationMuteDuration | 'off') => void;
  onMarkRead: () => void;
  onReport: () => void;
  onBlock: () => void;
  onDelete: () => void;
  t: Translate;
}) {
  return (
    <>
      {menu.pin ? (
        <Button
          label={pinned ? t('inbox.unpin') : t('inbox.pin')}
          systemImage={resolveAppIconName(pinned ? 'unpin' : 'pin')}
          onPress={onTogglePin}
        />
      ) : null}
      {menu.markRead ? (
        <Button
          label={t('inbox.markRead')}
          systemImage={resolveAppIconName('markRead')}
          onPress={onMarkRead}
        />
      ) : null}
      {menu.mute ? (
        muted ? (
          <Button
            label={t('chat.unmute')}
            systemImage={resolveAppIconName('notification')}
            onPress={() => onSetMute('off')}
          />
        ) : (
          <Menu label={t('chat.mute')} systemImage={resolveAppIconName('notificationOff')}>
            <Button label={t('chat.mute1h')} onPress={() => onSetMute('1h')} />
            <Button label={t('chat.mute24h')} onPress={() => onSetMute('24h')} />
            <Button label={t('chat.muteForever')} onPress={() => onSetMute('forever')} />
          </Menu>
        )
      ) : null}
      <Divider />
      {menu.report ? (
        <Button
          label={t('chat.report')}
          systemImage={resolveAppIconName('report')}
          onPress={onReport}
        />
      ) : null}
      {menu.block ? (
        <Button
          label={t('chat.block')}
          systemImage={resolveAppIconName('block')}
          role="destructive"
          onPress={onBlock}
        />
      ) : null}
      {menu.delete ? (
        <Button
          label={t('inbox.deleteConversation')}
          systemImage={resolveAppIconName('trash')}
          role="destructive"
          onPress={onDelete}
        />
      ) : null}
    </>
  );
}

type RowHandlers = {
  onOpen: (row: InboxRowModel) => void;
  onDelete: (row: InboxRowModel) => void;
  onBlock: (row: InboxRowModel) => void;
  onReport: (row: InboxRowModel) => void;
  onTogglePin: (row: InboxRowModel) => void;
  onRequestMute: (row: InboxRowModel) => void;
  onSetMute: (row: InboxRowModel, duration: ConversationMuteDuration | 'off') => void;
  onMarkRead: (row: InboxRowModel) => void;
  onUploadAction: (row: InboxRowModel, action: UploadRowAction) => void;
};

/**
 * Memoized (PERF-16): the handlers are stable and take the row, so an inbox re-render (upload
 * progress, presence, avatar URLs) only re-renders the rows whose own props changed.
 */
const MessageRow = memo(function MessageRow({
  row,
  avatarUrl,
  busy,
  isFirst,
  pinned,
  muted,
  friendshipBadge,
  reactionGlyph,
  muteAvailable,
  networkActionsEnabled,
  handlers,
  t,
}: {
  row: InboxRowModel;
  avatarUrl: string | null;
  busy: boolean;
  isFirst: boolean;
  pinned: boolean;
  muted: boolean;
  friendshipBadge: FriendshipBadge | null;
  reactionGlyph: string | null;
  muteAvailable: boolean;
  networkActionsEnabled: boolean;
  handlers: RowHandlers;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const menu = resolveInboxRowMenu({
    row,
    busy,
    online: networkActionsEnabled,
    muteAvailable,
  });
  const label = rowSubtitle(row, t, reactionGlyph);
  const onTogglePin = () => handlers.onTogglePin(row);
  const onToggleMute = () => (muted ? handlers.onSetMute(row, 'off') : handlers.onRequestMute(row));
  const onDelete = () => handlers.onDelete(row);

  // List-row traits go on the outermost view of the row (the context menu when there is one).
  const rowModifiers: ModifierConfig[] = [
    listRowInsets({ top: 12, leading: 8, bottom: 12, trailing: 16 }),
    listRowBackground(colors.background),
    ...(isFirst ? [listRowSeparator('hidden', 'top')] : []),
  ];
  const a11yLabel = buildInboxRowAccessibilityLabel({
    // Voice Control needs the visible name in the label.
    name: row.display_name || `@${row.username}`,
    friendshipLabel: friendshipBadgeAccessibilityLabel(friendshipBadge, t),
    unreadLabel: row.unread ? t('inbox.unreadA11y') : null,
    pinnedLabel: pinned ? t('inbox.pinnedA11y') : null,
    mutedLabel: muted ? t('inbox.mutedA11y') : null,
    status: label,
    timestamp: row.upload ? '' : row.timestampLabel,
  });
  const content = (
    <MessageRowContent
      row={row}
      avatarUrl={avatarUrl}
      busy={busy}
      pinned={pinned}
      muted={muted}
      friendshipBadge={friendshipBadge}
      reactionGlyph={reactionGlyph}
      t={t}
    />
  );

  // A real SwiftUI button: native press highlight and the button trait for VoiceOver.
  const rowButton = busy ? (
    <HStack modifiers={[accessibilityElement('ignore'), accessibilityLabel(a11yLabel)]}>
      {content}
    </HStack>
  ) : (
    <Button
      onPress={() => handlers.onOpen(row)}
      modifiers={[
        buttonStyle('plain'),
        accessibilityLabel(a11yLabel),
        accessibilityHint(
          row.kind === 'nix' && row.unread ? t('inbox.openHint') : t('inbox.openChatHint'),
        ),
      ]}>
      {content}
    </Button>
  );

  const withMenu = hasInboxRowMenu(menu) ? (
    <ContextMenu modifiers={rowModifiers}>
      <ContextMenu.Trigger>{rowButton}</ContextMenu.Trigger>
      <ContextMenu.Items>
        <MessageContextMenuItems
          menu={menu}
          pinned={pinned}
          muted={muted}
          onTogglePin={onTogglePin}
          onSetMute={(duration) => handlers.onSetMute(row, duration)}
          onMarkRead={() => handlers.onMarkRead(row)}
          onReport={() => handlers.onReport(row)}
          onBlock={() => handlers.onBlock(row)}
          onDelete={onDelete}
          t={t}
        />
      </ContextMenu.Items>
    </ContextMenu>
  ) : (
    <HStack modifiers={rowModifiers}>{rowButton}</HStack>
  );

  if (busy) return withMenu;

  const leading = (
    <MessageLeadingSwipeActions
      row={row}
      pinned={pinned}
      muted={muted}
      menu={menu}
      onUploadAction={(action) => handlers.onUploadAction(row, action)}
      onTogglePin={onTogglePin}
      onToggleMute={onToggleMute}
      t={t}
    />
  );

  return (
    <SwipeActions>
      {withMenu}
      {leading}
      {menu.delete ? (
        <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
          {/* Bez role=destructive: SwiftUI List od razu animuje wiersz poza listę przed Alertem. */}
          <Button
            label={t('inbox.delete')}
            systemImage={resolveAppIconName('trash')}
            onPress={onDelete}
            modifiers={[tint(colors.destructive)]}
          />
        </SwipeActions.Actions>
      ) : null}
    </SwipeActions>
  );
});

function LegacyUnavailableState({
  title,
  description,
  systemImage,
}: {
  title: string;
  description: string;
  systemImage: AppIconName;
}) {
  return (
    <VStack alignment="center" spacing={8} modifiers={[padding({ horizontal: 32 })]}>
      <Image
        systemName={resolveAppIconName(systemImage)}
        modifiers={[
          font({ design: 'rounded', textStyle: 'largeTitle' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          accessibilityHidden(),
        ]}
      />
      <Text
        modifiers={[
          font({ design: 'rounded', textStyle: 'title3', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'primary' }),
          multilineTextAlignment('center'),
        ]}>
        {title}
      </Text>
      <Text
        modifiers={[
          font({ design: 'rounded', textStyle: 'subheadline' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          multilineTextAlignment('center'),
        ]}>
        {description}
      </Text>
    </VStack>
  );
}

/**
 * Empty / offline / error / no-results. Hosted in a one-row List so pull-to-refresh has something
 * to pull (a bare VStack with `refreshable` never scrolls).
 */
function InboxUnavailableState({
  kind,
  title,
  description,
  onRefresh,
  actionLabel,
  onAction,
}: {
  kind: 'empty' | 'offline' | 'error' | 'search';
  title: string;
  description: string;
  onRefresh: () => Promise<void>;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, statusBarStyle } = useAppTheme();
  const { height } = useWindowDimensions();
  const systemImage: AppIconName =
    kind === 'empty'
      ? 'inbox'
      : kind === 'offline'
        ? 'offline'
        : kind === 'search'
          ? 'search'
          : 'warning';
  const state = supportsContentUnavailableView ? (
    <ContentUnavailableView
      title={title}
      description={description}
      systemImage={resolveAppIconName(systemImage)}
    />
  ) : (
    <LegacyUnavailableState title={title} description={description} systemImage={systemImage} />
  );

  return (
    <AppHost
      style={[styles.container, { backgroundColor: colors.background }]}
      useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <List
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          listStyle('plain'),
          scrollContentBackground('hidden'),
          refreshable(onRefresh),
        ]}>
        <VStack
          alignment="center"
          spacing={16}
          modifiers={[
            // About the visible area under the large title, so the state sits mid-screen.
            frame({ maxWidth: Infinity, minHeight: Math.round(height * 0.55), alignment: 'center' }),
            listRowBackground('transparent'),
            listRowSeparator('hidden'),
          ]}>
          {state}
          {actionLabel && onAction ? (
            <Button
              label={actionLabel}
              onPress={onAction}
              modifiers={[
                buttonStyle('borderedProminent'),
                controlSize('regular'),
                tint(colors.accent),
              ]}
            />
          ) : null}
        </VStack>
      </List>
    </AppHost>
  );
}

function InboxList({
  vm,
  onRequestDelete,
  onRequestBlock,
  onRequestReport,
  onRequestMute,
  onRequestUploadAction,
}: InboxScreenSurfaceProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const listModifiers = [
    frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
    listStyle('plain'),
    scrollContentBackground('hidden'),
    scrollEdgeEffectStyle('soft'),
    refreshable(vm.handleRefresh),
  ];

  // Stable identities for the memoized rows (PERF-16); each row binds itself to its own `row`.
  const onOpen = useStableHandler((row: InboxRowModel) => vm.handleOpen(row));
  const onDelete = useStableHandler(onRequestDelete);
  const onBlock = useStableHandler(onRequestBlock);
  const onReport = useStableHandler(onRequestReport);
  const onMute = useStableHandler(onRequestMute);
  const onTogglePin = useStableHandler((row: InboxRowModel) => void vm.handleTogglePin(row));
  const onSetMute = useStableHandler(
    (row: InboxRowModel, duration: ConversationMuteDuration | 'off') =>
      void vm.handleSetMute(row, duration),
  );
  const onMarkRead = useStableHandler((row: InboxRowModel) => void vm.handleMarkRead(row));
  const onUploadAction = useStableHandler(onRequestUploadAction);
  const handlers = useMemo<RowHandlers>(
    () => ({
      onOpen,
      onDelete,
      onBlock,
      onReport,
      onRequestMute: onMute,
      onTogglePin,
      onSetMute,
      onMarkRead,
      onUploadAction,
    }),
    [onBlock, onDelete, onMarkRead, onMute, onOpen, onReport, onSetMute, onTogglePin, onUploadAction],
  );

  const messageRows = vm.rows.map((row, index) => (
    <MessageRow
      // One row per conversation: keyed by peer so the optimistic upload row and the confirmed
      // server row are the same SwiftUI row (no remount / avatar flicker on confirmation).
      key={`peer:${row.peerId}`}
      row={row}
      avatarUrl={row.avatarStoragePath ? vm.avatarUrls[row.avatarStoragePath] ?? null : null}
      busy={vm.busyPeerIds.has(row.peerId)}
      isFirst={index === 0}
      pinned={vm.pinnedPeerIds.has(row.peerId)}
      muted={vm.mutedPeerIds.has(row.peerId)}
      friendshipBadge={vm.friendshipBadges.get(row.peerId) ?? null}
      reactionGlyph={reactionGlyphFor(vm.nixReactionFor(row))}
      muteAvailable={vm.muteAvailable}
      networkActionsEnabled={vm.canPerformNetworkAction}
      handlers={handlers}
      t={vm.t}
    />
  ));

  return (
    <AppHost
      style={[styles.container, { backgroundColor: colors.background }]}
      useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <List modifiers={listModifiers}>
        {vm.requests.length > 0 ? (
          <Section title={vm.t('inbox.invites')}>
            {vm.requests.map((request, index) => {
              const avatarPath = request.requester.avatar_storage_path ?? null;
              return (
                <IncomingInviteRow
                  key={request.id}
                  request={request}
                  avatarUrl={avatarPath ? vm.avatarUrls[avatarPath] ?? null : null}
                  avatarSize={INVITE_AVATAR_SIZE}
                  busy={vm.inviteActionIds.has(request.id)}
                  enabled={vm.canPerformNetworkAction}
                  description={vm.t('inbox.inviteDescription')}
                  onAccept={() => void vm.handleAccept(request.id)}
                  onReject={() => void vm.handleReject(request.id)}
                  t={vm.t}
                  modifiers={[
                    listRowInsets({ top: 10, leading: 16, bottom: 10, trailing: 16 }),
                    listRowBackground(colors.background),
                    ...(index === 0 ? [listRowSeparator('hidden', 'top')] : []),
                  ]}
                />
              );
            })}
          </Section>
        ) : null}
        {messageRows.length > 0 && vm.requests.length > 0 ? (
          <Section title={vm.t('inbox.messages')}>{messageRows}</Section>
        ) : (
          messageRows
        )}
      </List>
    </AppHost>
  );
}

export function InboxScreenSurface(props: InboxScreenSurfaceProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { vm } = props;

  if (vm.loading) {
    return (
      <AppHost style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={statusBarStyle} />
        <VStack
          alignment="center"
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' })]}>
          <ProgressView modifiers={[accessibilityLabel(vm.t('common.loading'))]} />
        </VStack>
      </AppHost>
    );
  }

  if (vm.initialError) {
    return (
      <InboxUnavailableState
        kind="error"
        title={vm.t('inbox.loadErrorTitle')}
        description={vm.t('inbox.loadErrorDescription')}
        onRefresh={vm.handleRefresh}
        actionLabel={vm.t('inbox.retry')}
        onAction={() => void vm.handleRetry()}
      />
    );
  }

  if (vm.showEmpty) {
    const offline = vm.showOfflineCacheMissing;
    return (
      <InboxUnavailableState
        kind={offline ? 'offline' : 'empty'}
        title={vm.t(offline ? 'chat.offlineNoCacheTitle' : 'inbox.emptyTitle')}
        description={vm.t(offline ? 'root.offlineCacheMissing' : 'inbox.emptyDescription')}
        onRefresh={vm.handleRefresh}
        actionLabel={offline ? undefined : vm.t('inbox.newChatTitle')}
        onAction={offline ? undefined : props.onCompose}
      />
    );
  }

  if (vm.showSearchEmpty) {
    return (
      <InboxUnavailableState
        kind="search"
        title={vm.t('inbox.searchEmptyTitle')}
        description={vm.t('inbox.searchEmptyDescription')}
        onRefresh={vm.handleRefresh}
      />
    );
  }

  return <InboxList {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

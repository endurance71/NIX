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
  ZStack,
} from '@expo/ui/swift-ui';
import {
  Animation,
  accessibilityElement,
  accessibilityHidden,
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  animation,
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
import {
  PINNED_GRID_NAME_SPACING,
  layoutPinnedGrid,
  pinnedGridAnimationKey,
  resolvePinnedGridColumns,
} from '../../lib/inboxPinnedGrid';
import { useMotionEnabled } from '../../theme/motion';
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
  // Moderation runs in the background: the sender sees „Wysłano”, not a separate check step.
  confirming: 'checkCircleFill',
  preparing: null,
  uploading: null,
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
      return colors.accentText;
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
        return t('inbox.uploadCompleted');
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
  const color = useUploadPhaseColor(upload?.phase) ?? colors.accentText;
  if (!upload) return null;
  const percent = `${Math.round(upload.progress * 100)}%`;
  const icon = UPLOAD_PHASE_ICONS[upload.phase];
  const showPercent = icon === null;
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
          value={upload.progress}
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

function MessageSubtitle({ row, label, lines = 1 }: { row: InboxRowModel; label: string; lines?: number }) {
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
            lineLimit(lines),
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
        lineLimit(lines),
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
  stacked = false,
  t,
}: {
  row: InboxRowModel;
  busy: boolean;
  pinned: boolean;
  muted: boolean;
  /** Accessibility-size layout: the time sits on its own line under the status, no chevron. */
  stacked?: boolean;
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
      {stacked ? null : (
        <Image
          systemName={resolveAppIconName('chevronRight')}
          size={APP_ICON_SIZE.xs}
          color={colors.tertiaryLabel}
        />
      )}
    </HStack>
  );
}

/**
 * From this Dynamic Type scale (the accessibility sizes) a row stacks vertically: name and status
 * may take two lines each and the time moves under them, instead of „Dami…” / „Dostarc…” squeezed
 * beside a large timestamp.
 */
const INBOX_STACKED_ROW_FONT_SCALE = 1.5;

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
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= INBOX_STACKED_ROW_FONT_SCALE;
  const textLines = stacked ? 2 : 1;
  const label = rowSubtitle(row, t, reactionGlyph);

  return (
    <HStack
      alignment={stacked ? 'top' : 'center'}
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
              lineLimit(textLines),
            ]}>
            {row.display_name || `@${row.username}`}
          </Text>
          <FriendshipBadgeLabel badge={friendshipBadge} decorative />
        </HStack>
        <MessageSubtitle row={row} label={label} lines={textLines} />
        {stacked ? (
          <MessageAccessory row={row} busy={busy} pinned={pinned} muted={muted} stacked t={t} />
        ) : null}
      </VStack>

      {stacked ? null : <MessageAccessory row={row} busy={busy} pinned={pinned} muted={muted} t={t} />}
    </HStack>
  );
}

function selectPrimaryUploadAction(upload: InboxRowModel['upload']): UploadRowAction | null {
  if (upload?.actions.resumeJobIds.length) return 'resume';
  if (upload?.actions.retryJobIds.length) return 'retry';
  if (upload?.actions.pauseJobIds.length) return 'pause';
  return null;
}

function uploadActionLabel(action: UploadRowAction, t: Translate) {
  switch (action) {
    case 'resume':
      return t('inbox.uploadResume');
    case 'retry':
      return t('inbox.uploadRetry');
    case 'pause':
      return t('inbox.uploadPause');
    case 'cancel':
      return t('inbox.uploadCancel');
  }
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
    return (
      <SwipeActions.Actions edge="leading" allowsFullSwipe={false}>
        {primaryUploadAction ? (
          <Button
            label={uploadActionLabel(primaryUploadAction, t)}
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
          modifiers={[tint(colors.accentText)]}
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

/** Insets of the list row that hosts the pinned grid; the grid lays out in the width between them. */
const PINNED_GRID_ROW_INSET = 16;
const PINNED_UNREAD_DOT_SIZE = 14;
/** Ring in the screen background around the unread dot, so it reads on any avatar photo. */
const PINNED_UNREAD_RING = 3;
const PINNED_STATUS_BADGE_SIZE = 28;
/** Pin / unpin: cells glide to their new place (≈ motion.spring.default, SwiftUI `.smooth`). */
const PINNED_GRID_ANIMATION = Animation.smooth({ duration: 0.35 });

/** Upload progress / problem (or a pending action) in a small badge on the avatar's corner. */
function PinnedStatusBadge({ row, busy }: { row: InboxRowModel; busy: boolean }) {
  const { colors } = useAppTheme();
  const uploadColor = useUploadPhaseColor(row.upload?.phase) ?? colors.accentText;
  const upload = row.upload;
  if (!busy && !upload) return null;
  const icon = upload ? UPLOAD_PHASE_ICONS[upload.phase] : null;
  return (
    <ZStack alignment="center" modifiers={[accessibilityHidden()]}>
      <Circle
        modifiers={[
          frame({ width: PINNED_STATUS_BADGE_SIZE, height: PINNED_STATUS_BADGE_SIZE }),
          foregroundStyle(colors.background),
        ]}
      />
      {busy ? (
        <ProgressView modifiers={[controlSize('small')]} />
      ) : icon ? (
        <Image systemName={resolveAppIconName(icon)} size={APP_ICON_SIZE.sm} color={uploadColor} />
      ) : (
        <ProgressView
          value={upload?.progress ?? 0}
          modifiers={[
            progressViewStyle('circular'),
            frame({ width: 20, height: 20 }),
            tint(uploadColor),
          ]}
        />
      )}
    </ZStack>
  );
}

/** Retry / resume / pause / cancel of a pinned conversation's upload — rows have them on swipe. */
function PinnedUploadMenuItems({
  row,
  onUploadAction,
  divided,
  t,
}: {
  row: InboxRowModel;
  onUploadAction: (action: UploadRowAction) => void;
  /** A divider before the conversation actions that follow. */
  divided: boolean;
  t: Translate;
}) {
  const primary = selectPrimaryUploadAction(row.upload);
  const canCancel = Boolean(row.upload?.actions.cancelJobIds.length);
  if (!primary && !canCancel) return null;
  return (
    <>
      {primary ? (
        <Button label={uploadActionLabel(primary, t)} onPress={() => onUploadAction(primary)} />
      ) : null}
      {canCancel ? (
        <Button
          label={uploadActionLabel('cancel', t)}
          role="destructive"
          onPress={() => onUploadAction('cancel')}
        />
      ) : null}
      {divided ? <Divider /> : null}
    </>
  );
}

/**
 * One pinned conversation: a large avatar with the name under it, like a pin in Messages. Tap and
 * long press do what the row does (open the chat / the same context menu); VoiceOver reads one
 * element with the row's label. Memoized like `MessageRow` (PERF-16).
 */
const PinnedConversationCell = memo(function PinnedConversationCell({
  row,
  avatarUrl,
  busy,
  muted,
  friendshipBadge,
  reactionGlyph,
  muteAvailable,
  networkActionsEnabled,
  handlers,
  x,
  y,
  cellWidth,
  cellHeight,
  avatarSize,
  animationKey,
  t,
}: {
  row: InboxRowModel;
  avatarUrl: string | null;
  busy: boolean;
  muted: boolean;
  friendshipBadge: FriendshipBadge | null;
  reactionGlyph: string | null;
  muteAvailable: boolean;
  networkActionsEnabled: boolean;
  handlers: RowHandlers;
  x: number;
  y: number;
  cellWidth: number;
  cellHeight: number;
  avatarSize: number;
  /** Pinned-set key for the glide animation; `null` with Reduce Motion (cells jump into place). */
  animationKey: number | null;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const menu = resolveInboxRowMenu({ row, busy, online: networkActionsEnabled, muteAvailable });
  const name = row.display_name || `@${row.username}`;
  const a11yLabel = buildInboxRowAccessibilityLabel({
    name,
    friendshipLabel: friendshipBadgeAccessibilityLabel(friendshipBadge, t),
    unreadLabel: row.unread ? t('inbox.unreadA11y') : null,
    pinnedLabel: t('inbox.pinnedA11y'),
    mutedLabel: muted ? t('inbox.mutedA11y') : null,
    // The grid shows no status line; VoiceOver still gets the facts the row would show.
    status: rowSubtitle(row, t, reactionGlyph),
    timestamp: row.upload ? '' : row.timestampLabel,
  });

  // Absolutely placed in the grid (see layoutPinnedGrid): padding, not offset, so the context
  // menu preview lifts from where the cell really is; the padding animates on pin / unpin.
  const placement: ModifierConfig[] = [
    padding({ leading: x, top: y }),
    ...(animationKey === null ? [] : [animation(PINNED_GRID_ANIMATION, animationKey)]),
  ];

  const content = (
    <VStack
      alignment="center"
      spacing={PINNED_GRID_NAME_SPACING}
      modifiers={[
        frame({ width: cellWidth, height: cellHeight, alignment: 'top' }),
        contentShape(shapes.rectangle()),
      ]}>
      <ZStack
        alignment="bottomTrailing"
        modifiers={[frame({ width: avatarSize, height: avatarSize })]}>
        <ZStack alignment="topLeading" modifiers={[frame({ width: avatarSize, height: avatarSize })]}>
          {avatarView({
            size: avatarSize,
            url: avatarUrl,
            storagePath: row.avatarStoragePath,
            emoji: row.avatarEmoji,
            fallbackInitial: row.username,
          })}
          {/* Unread: a blue dot on the avatar's corner, like an unread pin in Messages. */}
          {row.unread ? (
            <ZStack alignment="center" modifiers={[accessibilityHidden()]}>
              <Circle
                modifiers={[
                  frame({
                    width: PINNED_UNREAD_DOT_SIZE + PINNED_UNREAD_RING * 2,
                    height: PINNED_UNREAD_DOT_SIZE + PINNED_UNREAD_RING * 2,
                  }),
                  foregroundStyle(colors.background),
                ]}
              />
              <Circle
                modifiers={[
                  frame({ width: PINNED_UNREAD_DOT_SIZE, height: PINNED_UNREAD_DOT_SIZE }),
                  foregroundStyle(colors.systemBlue),
                ]}
              />
            </ZStack>
          ) : null}
        </ZStack>
        <PinnedStatusBadge row={row} busy={busy} />
      </ZStack>
      {/* Streak / best-friend glyphs stay; the name truncates first. */}
      <HStack alignment="center" spacing={3} modifiers={[frame({ maxWidth: cellWidth })]}>
        {muted ? (
          <Image
            systemName={resolveAppIconName('notificationOff')}
            size={APP_ICON_SIZE.xs}
            color={colors.secondaryLabel}
            modifiers={[accessibilityHidden()]}
          />
        ) : null}
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'footnote', weight: row.unread ? 'semibold' : 'regular' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(1),
          ]}>
          {name}
        </Text>
        <FriendshipBadgeLabel badge={friendshipBadge} decorative compact />
      </HStack>
    </VStack>
  );

  if (busy) {
    return (
      <HStack
        modifiers={[...placement, accessibilityElement('ignore'), accessibilityLabel(a11yLabel)]}>
        {content}
      </HStack>
    );
  }

  const cellButton = (
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
  const hasRowMenu = hasInboxRowMenu(menu);
  const hasUploadItems = Boolean(
    selectPrimaryUploadAction(row.upload) || row.upload?.actions.cancelJobIds.length,
  );
  if (!hasRowMenu && !hasUploadItems) {
    return <HStack modifiers={placement}>{cellButton}</HStack>;
  }

  return (
    <ContextMenu modifiers={placement}>
      <ContextMenu.Trigger>{cellButton}</ContextMenu.Trigger>
      <ContextMenu.Items>
        <PinnedUploadMenuItems
          row={row}
          onUploadAction={(action) => handlers.onUploadAction(row, action)}
          divided={hasRowMenu}
          t={t}
        />
        {hasRowMenu ? (
          <MessageContextMenuItems
            menu={menu}
            pinned
            muted={muted}
            onTogglePin={() => handlers.onTogglePin(row)}
            onSetMute={(duration) => handlers.onSetMute(row, duration)}
            onMarkRead={() => handlers.onMarkRead(row)}
            onReport={() => handlers.onReport(row)}
            onBlock={() => handlers.onBlock(row)}
            onDelete={() => handlers.onDelete(row)}
            t={t}
          />
        ) : null}
      </ContextMenu.Items>
    </ContextMenu>
  );
});

/**
 * Pinned conversations as a grid of large avatars at the top of the list (Messages, iOS 26): rows
 * of `columns`, every row centered. One list row, so it scrolls with the conversations under it.
 */
function PinnedConversationsGrid({
  rows,
  columns,
  vm,
  handlers,
}: {
  rows: readonly InboxRowModel[];
  columns: number;
  vm: InboxScreenViewModel;
  handlers: RowHandlers;
}) {
  const { colors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const motionEnabled = useMotionEnabled();
  const gridWidth = Math.max(0, width - PINNED_GRID_ROW_INSET * 2);
  const layout = layoutPinnedGrid({ count: rows.length, columns, width: gridWidth, fontScale });
  const animationKey = motionEnabled ? pinnedGridAnimationKey(rows.map((row) => row.peerId)) : null;

  return (
    <ZStack
      alignment="topLeading"
      modifiers={[
        frame({ width: gridWidth, height: layout.height, alignment: 'topLeading' }),
        listRowInsets({
          top: 8,
          leading: PINNED_GRID_ROW_INSET,
          bottom: 16,
          trailing: PINNED_GRID_ROW_INSET,
        }),
        listRowBackground(colors.background),
        listRowSeparator('hidden'),
        // Fades a pin in / out while the others glide (and the row resizes) on pin / unpin.
        ...(animationKey === null ? [] : [animation(PINNED_GRID_ANIMATION, animationKey)]),
      ]}>
      {rows.map((row, index) => {
        const position = layout.positions[index] ?? { x: 0, y: 0 };
        return (
          <PinnedConversationCell
            // Peer key: a pin keeps its cell (and avatar) while the grid reflows around it.
            key={`pin:${row.peerId}`}
            row={row}
            avatarUrl={row.avatarStoragePath ? vm.avatarUrls[row.avatarStoragePath] ?? null : null}
            busy={vm.busyPeerIds.has(row.peerId)}
            muted={vm.mutedPeerIds.has(row.peerId)}
            friendshipBadge={vm.friendshipBadges.get(row.peerId) ?? null}
            reactionGlyph={reactionGlyphFor(vm.nixReactionFor(row))}
            muteAvailable={vm.muteAvailable}
            networkActionsEnabled={vm.canPerformNetworkAction}
            handlers={handlers}
            x={position.x}
            y={position.y}
            cellWidth={layout.cellWidth}
            cellHeight={layout.cellHeight}
            avatarSize={layout.avatarSize}
            animationKey={animationKey}
            t={vm.t}
          />
        );
      })}
    </ZStack>
  );
}

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

  // Pinned conversations become the avatar grid (like Messages) unless searching or at the largest
  // text sizes, where they stay ordinary rows at the top of the list.
  const { fontScale } = useWindowDimensions();
  const pinnedGridColumns = resolvePinnedGridColumns(fontScale);
  const showPinnedGrid = pinnedGridColumns !== null && vm.pinnedRows.length > 0;
  const listRows = showPinnedGrid ? vm.unpinnedRows : vm.rows;
  const pinnedGrid = showPinnedGrid ? (
    <PinnedConversationsGrid
      key="pinned-grid"
      rows={vm.pinnedRows}
      columns={pinnedGridColumns}
      vm={vm}
      handlers={handlers}
    />
  ) : null;

  const messageRows = listRows.map((row, index) => (
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
        {(pinnedGrid || messageRows.length > 0) && vm.requests.length > 0 ? (
          <Section title={vm.t('inbox.messages')}>
            {pinnedGrid}
            {messageRows}
          </Section>
        ) : (
          <>
            {pinnedGrid}
            {messageRows}
          </>
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

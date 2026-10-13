import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import { Button, Host } from '@expo/ui';
import { ProgressView } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  frame,
  progressViewStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import Animated, {
  FadeIn,
  ZoomIn,
  ZoomOut,
  KeyboardState,
  scrollTo,
  useAnimatedKeyboard,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type AnimatedKeyboardInfo,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import type { ChatComposerContext, ChatScreenViewModel, OptimisticTextMessage } from '../../hooks/useChatScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { useStableHandler } from '../../hooks/useStableHandler';
import { selection } from '../../lib/haptics';
import { isNixFirstOpenAvailable, isNixReplayAvailable } from '../../lib/nixReplay';
import {
  buildUnifiedChatTimeline,
  formatChatTime,
  type ChatBubbleGroupPosition,
  type ChatSeparatorRelativeLabels,
  type ChatTimelineItem,
} from '../../lib/chatTimeline';
import { chatMessageAccessibilityLabel, shouldShowComposerCounter } from '../../lib/chatMessageA11y';
import {
  countAppendedIncomingItems,
  distanceFromListEnd,
  nextScrolledUpState,
} from '../../lib/chatScrollState';
import { useCalendarDayClock } from '../../hooks/useCalendarDayClock';
import type { ChatOutboxStatus } from '../../lib/chatOutboxMessages';
import type { ChatPastePayload } from '../../lib/chatPaste';
import type { UploadRowAction } from '../../lib/inboxPresentation';
import {
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_REACTION_GLYPHS,
} from '../../services/messageReactionService';
import type { ChatNixEvent } from '../../services/nixService';
import { TEXT_MESSAGE_MAX_LENGTH } from '../../services/textMessageService';
import {
  incomingNixStatus,
  messageKindForMedia,
  messageStatusColor,
  messageStatusPresentation,
  outgoingNixStatus,
  outgoingTextStatus,
  type MessageStatus,
} from '../../lib/messageStatus';
import type { MessageReaction, MessageReactionEmoji } from '../../types/database.types';
import { NixReactionBadge } from '../nix/NixReactionBadge';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { SOFT_SCROLL_EDGE_EFFECTS } from '../../theme/scrollEdge';
import type { DurableUploadJob } from '../../types/uploadQueue';
import {
  chatMediaBubblePresentation,
  chatUploadActions,
  sharedRecipientCount,
  type ChatMediaBubbleIcon,
  type ChatMediaBubblePresentation,
  type ChatUploadAction,
} from '../../lib/chatUploadPresentation';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';
import { STACK_NAV_BAR_HEIGHT } from '../../theme/safeArea';
import { typography } from '../../theme/typography';
import { AppIcon } from '../ui/app-icon';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { TextInputWrapper } from 'expo-paste-input';
import i18n from '../../lib/i18n';
import { notifyError } from '../../lib/appNotify';
import { chatBubbleShape } from '../../lib/chatBubbleShape';
import { chatSavedState, chatVoiceInfo, formatVoiceDuration } from '../../lib/chatMessageExtras';
import {
  ChatVoicePlaybackContext,
  useChatVoicePlayback,
  useVoicePhase,
  type ChatVoicePlayback,
} from '../../hooks/useChatVoicePlayback';
import type { VoiceRecordingResult } from '../../hooks/useVoiceRecorder';
import { BubbleTail } from './BubbleTail';
import { VoiceMessageBody } from './VoiceMessageBody';
import { NixReplyHeader } from './NixReplyHeader';
import { chatNixReplyContext, chatTimelineNixIndex, type ChatNixReplyContext } from '../../lib/chatNixReply';
import { ComposerVoiceHost, VoiceRecordingStrip, VoiceReviewStrip } from './ComposerVoice';
import type { ComposerVoiceState } from '../../hooks/useComposerVoice';
import {
  chatMessageReplyContext,
  chatTimelineMessageIndex,
  type ChatMessageActions,
} from '../../lib/chatMessageActions';
import { MessageReplyHeader } from './MessageReplyHeader';
import { SwipeToReply } from './SwipeToReply';
import { ComposerContextPresence } from './ComposerContextBar';
import type { MessageActionMenuItem } from './MessageActionMenu';
import { MessageOverlay, type MessageOverlayRequest } from './MessageOverlay';

type ChatTimelineEntry = ChatTimelineItem<OptimisticTextMessage>;

type ChatScreenSurfaceProps = {
  vm: ChatScreenViewModel;
};

export type ChatComposerProps = {
  t: ChatScreenViewModel['t'];
  keyboardHeight: SharedValue<number>;
  restingPad: number;
  pasteInputEnabled: boolean;
  pasteImporting: boolean;
  onPaste: (payload: ChatPastePayload) => Promise<void>;
  /** Resolves `false` when the text was not accepted and must go back into the input. */
  onSend: (body: string) => Promise<boolean>;
  /** Measured composer height (incl. the resting safe-area pad), read by the list on the UI thread. */
  composerHeight: SharedValue<number>;
  /** Every draft change, for the typing indicator. */
  onDraftChange: (text: string) => void;
  /** Blur: the user stopped typing. */
  onDraftBlur: () => void;
  onOpenCamera: () => void;
  /** Backend supports voice messages (mounts the recorder). */
  voiceEnabled: boolean;
  /** Online: the mic is offered; offline it is hidden (the recorder stays mounted). */
  voiceAvailable: boolean;
  onSendVoice: (recording: VoiceRecordingResult) => void;
  /** Recording starts: stop any voice message that is playing. */
  onVoiceRecordingStart: () => void;
  /** Reply / edit in progress, shown above the input. */
  context: ComposerContextView | null;
  onCancelContext: () => void;
};

/** The composer's reply / edit banner, already localized. */
export type ComposerContextView = {
  mode: ChatComposerContext['mode'];
  /** Changes for every new reply / edit, so the composer re-seeds and focuses once. */
  key: string;
  title: string;
  snippet: string;
  /** Edit: the text the input starts with. */
  seedText: string | null;
};

const BUBBLE_CORNER_RADIUS = 18;
const BUBBLE_MAX_WIDTH_RATIO = 0.72;
const COMPOSER_CONTROL_SIZE = 44;
/** Composer height without the safe-area pad at one line: top padding + one 44 pt control row. */
const COMPOSER_BASE_CONTENT_HEIGHT = 8 + COMPOSER_CONTROL_SIZE;
/** Multiline input grows up to this many lines, then scrolls inside. */
const COMPOSER_MAX_LINES = 5;
const COMPOSER_INPUT_VERTICAL_PAD = 11;
/** Minimalny pad composera przy otwartej klawiaturze (nad klawiaturą). */
const COMPOSER_KEYBOARD_PAD = 8;
/** Soft scroll-edge fade nad composerem (zamiast Stack.Toolbar). */
const COMPOSER_EDGE_FADE_EXTRA = 28;
const SCROLL_BUTTON_SIZE = 40;
/** Space between the composer's top edge and the „scroll to the newest” button. */
const SCROLL_BUTTON_GAP = 8;

/**
 * How far the composer rises above its resting position (PERF-26). One rounded number drives
 * the composer `translateY`, the list scroll and the list `contentInset`, so they never drift
 * apart by a pixel. At rest the composer keeps the safe-area pad; over the keyboard it keeps
 * `COMPOSER_KEYBOARD_PAD`.
 */
function chatKeyboardLift(keyboardHeight: number, restingPad: number) {
  'worklet';
  const kb = Math.round(Math.max(0, keyboardHeight));
  const rest = Math.round(restingPad);
  return Math.max(rest, kb + COMPOSER_KEYBOARD_PAD) - rest;
}

/** How much taller than one line the composer is right now (multiline draft, counter row). */
function composerOverflow(composerHeight: number, restingPad: number) {
  'worklet';
  return Math.max(0, Math.round(composerHeight - COMPOSER_BASE_CONTENT_HEIGHT - restingPad));
}

/** List position captured when a keyboard movement starts (UI thread). */
type KeyboardScrollAnchor = { offset: number; lift: number };

/**
 * Scroll offset that keeps the conversation glued above the moving composer.
 *
 * - Rising: follow the lift 1:1, but never past the end of the content plus the lift, and never
 *   pull the content back below where it already was (after an interactive drag the content may
 *   sit above the composer; it waits for the composer instead of jumping).
 * - Falling: interpolate from the start offset to the resting offset, so a list that was scrolled
 *   past its resting end (inset in place) lands exactly at the end with no jump.
 *
 * `maxAtRest` is `Infinity` until FlashList reported its sizes; native clamping still applies then.
 */
function keyboardScrollTarget(anchor: KeyboardScrollAnchor, lift: number, maxAtRest: number) {
  'worklet';
  if (lift > anchor.lift) {
    const glued = anchor.offset + (lift - anchor.lift);
    return Math.max(0, Math.min(glued, Math.max(maxAtRest + lift, anchor.offset)));
  }
  if (anchor.lift <= 0) return anchor.offset;
  const end = Math.min(Math.max(0, anchor.offset - anchor.lift), maxAtRest);
  return end + (anchor.offset - end) * (lift / anchor.lift);
}
const REACTION_BADGE_SIZE = 28;
/** Ile miejsca nad dymkiem rezerwujemy na badge (żeby nie nachodził na poprzednią wiadomość). */
const REACTION_BADGE_OVERHANG = Math.ceil(REACTION_BADGE_SIZE * 0.55);
/** Wysunięcie badge poza róg dymka (~połowa średnicy — jak Tapback w iMessage). */
const REACTION_BADGE_CORNER_OUTSET = Math.round(REACTION_BADGE_SIZE * 0.42);
function ReactionBadges({
  reactions,
  isOwnMessage,
  currentUserId,
  ownReactionBg,
  peerReactionBg,
  onPressBadge,
}: {
  reactions: readonly MessageReaction[];
  isOwnMessage: boolean;
  currentUserId: string;
  ownReactionBg: string;
  peerReactionBg: string;
  onPressBadge: () => void;
}) {
  const motionEnabled = useMotionEnabled();
  if (reactions.length === 0) return null;

  const badgeEntering = motionEnabled
    ? ZoomIn.springify()
        .damping(appleUiSpring.damping)
        .stiffness(appleUiSpring.stiffness)
        .mass(appleUiSpring.mass)
    : undefined;
  const badgeExiting = motionEnabled
    ? ZoomOut.springify()
        .damping(appleUiSpring.damping)
        .stiffness(appleUiSpring.stiffness)
        .mass(appleUiSpring.mass)
    : undefined;

  return (
    <View
      style={[
        styles.reactionBadges,
        isOwnMessage ? styles.reactionBadgesOwn : styles.reactionBadgesIncoming,
      ]}>
      {reactions.map((reaction) => {
        const fromCurrentUser = reaction.user_id === currentUserId;
        const badgeBg = fromCurrentUser ? ownReactionBg : peerReactionBg;
        return (
          <Animated.View
            key={reaction.id}
            entering={badgeEntering}
            exiting={badgeExiting}>
            <Pressable
              // Opening the bar plays its own selection haptic.
              onPress={onPressBadge}
              accessibilityRole="button"
              accessibilityLabel={MESSAGE_REACTION_GLYPHS[reaction.emoji]}
              style={[styles.reactionBadge, { backgroundColor: badgeBg }]}>
              <Text style={styles.reactionBadgeGlyph}>{MESSAGE_REACTION_GLYPHS[reaction.emoji]}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function outboxStatusText(status: ChatOutboxStatus | null): string | null {
  switch (status) {
    case 'waiting_network':
      return i18n.t('chat.sendWaitingNetwork');
    case 'failed':
      return i18n.t('chat.sendFailedTap');
    case 'expired':
      return i18n.t('chat.sendExpired');
    default:
      return null;
  }
}

type BubbleVoiceProps = {
  durationMs: number;
  waveform: readonly number[];
};

function MessageBubbleContent({
  messageId,
  body,
  voice,
  outboxStatus,
  isOwn,
  group,
  bubbleBg,
  labelColor,
  reactions,
  currentUserId,
  ownReactionBg,
  peerReactionBg,
  onPressBadge,
}: {
  messageId: string;
  body: string;
  voice: BubbleVoiceProps | null;
  outboxStatus: ChatOutboxStatus | null;
  isOwn: boolean;
  group: ChatBubbleGroupPosition | undefined;
  bubbleBg: string;
  labelColor: string;
  reactions: readonly MessageReaction[];
  currentUserId: string;
  ownReactionBg: string;
  peerReactionBg: string;
  onPressBadge: () => void;
}) {
  const { colors } = useAppTheme();
  const hasReactions = reactions.length > 0;
  const expired = outboxStatus === 'expired';
  const statusText = outboxStatusText(outboxStatus);
  const shape = chatBubbleShape(group, isOwn);
  // A tombstone is a translucent fill: a tail behind it would show through.
  const showTail = shape.showTail && !expired;
  return (
    <View
      style={[
        styles.bubbleWithReactions,
        // Hug the bubble's side: a wider receipt row below must not stretch the bubble.
        isOwn ? styles.bubbleOwn : styles.bubbleIncoming,
        hasReactions ? styles.bubbleWithReactionsActive : null,
      ]}>
      <View>
        {showTail ? <BubbleTail color={bubbleBg} side={isOwn ? 'right' : 'left'} /> : null}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleBg,
              borderTopLeftRadius: shape.borderTopLeftRadius,
              borderTopRightRadius: shape.borderTopRightRadius,
              borderBottomLeftRadius: shape.borderBottomLeftRadius,
              borderBottomRightRadius: shape.borderBottomRightRadius,
            },
          ]}>
          {/* A tombstone has no body left: only the status explains what happened (OFF-4). */}
          {expired ? null : voice ? (
            <VoiceMessageBody
              messageId={messageId}
              durationMs={voice.durationMs}
              waveform={voice.waveform}
              color={labelColor}
              buttonFill={isOwn ? colors.onChatBubbleOwn : colors.accent}
              buttonGlyph={isOwn ? colors.accent : colors.onAccent}
            />
          ) : (
            <Text style={[styles.bubbleText, { color: labelColor }]}>{body}</Text>
          )}
          {statusText ? (
            <Text
              style={[expired ? styles.expiredText : styles.outboxStatusText, { color: labelColor }]}>
              {statusText}
            </Text>
          ) : null}
        </View>
        {/* Beside the bubble, not inside it: inside, the spinner grew the bubble while sending
            (and pushed a fresh bubble under the composer), then the bubble shrank again. */}
        {outboxStatus === 'sending' ? (
          <View
            pointerEvents="none"
            style={[styles.sendingSpinnerSlot, isOwn ? styles.sendingSpinnerOwn : styles.sendingSpinnerIncoming]}>
            <ActivityIndicator size="small" color={colors.secondaryLabel} />
          </View>
        ) : null}
      </View>
      <ReactionBadges
        reactions={reactions}
        isOwnMessage={isOwn}
        currentUserId={currentUserId}
        ownReactionBg={ownReactionBg}
        peerReactionBg={peerReactionBg}
        onPressBadge={onPressBadge}
      />
    </View>
  );
}

/** „Zapisane przez …” under a saved bubble, on the bubble's side. */
function SavedMarker({ savedBy, peerName, isOwn }: { savedBy: 'me' | 'peer'; peerName: string; isOwn: boolean }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.savedRow, isOwn ? styles.savedRowOwn : styles.savedRowIncoming]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <SymbolView
        name={resolveAppIconName('savedMessage')}
        size={APP_ICON_SIZE.xs - 2}
        tintColor={colors.accentText}
        weight="semibold"
      />
      <Text style={[styles.savedText, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {savedBy === 'me' ? t('chat.savedByYou') : t('chat.savedByPeer', { name: peerName })}
      </Text>
    </View>
  );
}

type MessageBubbleProps = {
  messageId: string;
  body: string;
  createdAt: string;
  locale: string;
  isOwn: boolean;
  /** „Ty” or the peer's name, for VoiceOver. */
  senderName: string;
  peerName: string;
  /** Still a local outbox copy: fades in once, never on later re-renders. */
  isOptimistic: boolean;
  outboxStatus: ChatOutboxStatus | null;
  outboxId: string | null;
  /** Delivered / Opened under the last message, when it is mine (Snapchat-style receipt). */
  receipt: 'delivered' | 'opened' | null;
  maxWidth: number;
  reactions: readonly MessageReaction[];
  currentUserId: string;
  canReact: boolean;
  canCopy: boolean;
  /** iMessage grouping: corners, spacing and the tail. */
  group: ChatBubbleGroupPosition | undefined;
  /** Saved in the chat, and by whom (`null` = not saved). */
  savedBy: 'me' | 'peer' | null;
  /** Save / unsave offered (backend supports it, message on the server, online). */
  canSave: boolean;
  /** Voice message: length and loudness samples; `null` for text. */
  voiceDurationMs: number | null;
  voiceWaveform: readonly number[] | null;
  /** Reply to a NiX: the quoted header above the bubble (primitives keep the memo cheap). */
  replyToNixId: string | null;
  replyToNixKind: ChatNixReplyContext['kind'];
  replyToNixInTimeline: boolean;
  /** Quoted chat message (primitives keep the memo cheap); `null` author = no quote. */
  quoteAuthor: string | null;
  quoteSnippet: string;
  quoteIsVoice: boolean;
  quoteMessageId: string | null;
  quoteInTimeline: boolean;
  /** The sender changed the text after sending. */
  edited: boolean;
  /** Briefly marked after a quote scrolled to it. */
  highlighted: boolean;
  /** Reply / edit / unsend / forward available right now (rotor and swipe). */
  actions: ChatMessageActions;
  onReact: (messageId: string, emoji: MessageReactionEmoji) => void;
  onRemoveReaction: (messageId: string) => void;
  /**
   * Double tap (`tapback`: the large emoji bar alone) or long press (`menu`: blur, lifted bubble,
   * emoji bar and actions), with the bubble's frame in window coordinates.
   */
  onOpenOverlay: (request: BubbleOverlayRequest) => void;
  onCopy: (messageId: string) => void;
  onReport: (messageId: string) => void;
  onRetry: (outboxId: string) => void;
  onDeleteOutbox: (outboxId: string) => void;
  onCancelSending: (outboxId: string) => void;
  onSetSaved: (messageId: string, saved: boolean) => void;
  onToggleVoice: (messageId: string) => void;
  onShowRepliedNix: (nixId: string) => void;
  onReply: (messageId: string) => void;
  onEdit: (messageId: string) => void;
  onUnsend: (messageId: string) => void;
  onForward: (messageId: string) => void;
  onShowQuotedMessage: (messageId: string) => void;
};

type BubbleAccessibilityAction = { name: string; label: string };

/** VoiceOver rotor actions of a bubble; `activate` (play / pause) only for a voice message. */
function bubbleAccessibilityActions(
  t: ChatScreenViewModel['t'],
  flags: {
    playable: boolean;
    playing: boolean;
    canReact: boolean;
    myEmoji: MessageReactionEmoji | null;
    canSave: boolean;
    saved: boolean;
    copyable: boolean;
    reportable: boolean;
    retryable: boolean;
    deletable: boolean;
    showRepliedNix: boolean;
    showQuoted: boolean;
    messageActions: ChatMessageActions;
  },
): BubbleAccessibilityAction[] {
  const actions: BubbleAccessibilityAction[] = [];
  if (flags.showRepliedNix) actions.push({ name: 'showNix', label: t('chat.replyShowNix') });
  if (flags.showQuoted) actions.push({ name: 'showQuoted', label: t('chat.replyShowMessage') });
  if (flags.messageActions.reply) actions.push({ name: 'reply', label: t('chat.reply') });
  if (flags.playable) {
    actions.push({ name: 'activate', label: flags.playing ? t('chat.voicePause') : t('chat.voicePlay') });
  }
  if (flags.canReact) {
    for (const emoji of MESSAGE_REACTION_EMOJIS) {
      const glyph = MESSAGE_REACTION_GLYPHS[emoji];
      actions.push({
        name: `react:${emoji}`,
        label:
          flags.myEmoji === emoji
            ? t('chat.removeReactionWith', { emoji: glyph })
            : t('chat.reactWith', { emoji: glyph }),
      });
    }
  }
  if (flags.canSave) {
    actions.push({ name: 'toggleSave', label: flags.saved ? t('chat.unsaveMessage') : t('chat.saveMessage') });
  }
  if (flags.copyable) actions.push({ name: 'copy', label: t('chat.copy') });
  if (flags.messageActions.edit) actions.push({ name: 'edit', label: t('chat.edit') });
  if (flags.messageActions.forward) actions.push({ name: 'forward', label: t('chat.forward') });
  if (flags.messageActions.unsend) actions.push({ name: 'unsend', label: t('chat.unsend') });
  if (flags.reportable) actions.push({ name: 'report', label: t('chat.reportMessage') });
  if (flags.retryable) actions.push({ name: 'retry', label: t('chat.retrySend') });
  if (flags.deletable) actions.push({ name: 'delete', label: t('chat.deleteFailed') });
  return actions;
}

function bubbleColors(
  colors: ReturnType<typeof useAppTheme>['colors'],
  expired: boolean,
  isOwn: boolean,
): { bubbleBg: string; labelColor: string } {
  if (expired) return { bubbleBg: colors.secondarySystemFill, labelColor: colors.secondaryLabel };
  return isOwn
    ? { bubbleBg: colors.accent, labelColor: colors.onChatBubbleOwn }
    : { bubbleBg: colors.chatBubbleIncoming, labelColor: colors.label };
}

type BubbleActionHandlers = {
  activate: () => void;
  react: (emoji: MessageReactionEmoji) => void;
  toggleSave: () => void;
  copy: () => void;
  report: () => void;
  retry: () => void;
  delete: () => void;
  showNix: () => void;
  showQuoted: () => void;
  reply: () => void;
  edit: () => void;
  forward: () => void;
  unsend: () => void;
};

const SIMPLE_BUBBLE_ACTIONS = [
  'activate',
  'toggleSave',
  'copy',
  'report',
  'retry',
  'delete',
  'showNix',
  'showQuoted',
  'reply',
  'edit',
  'forward',
  'unsend',
] as const;

function runBubbleAccessibilityAction(name: string, handlers: BubbleActionHandlers) {
  if (name.startsWith('react:')) {
    handlers.react(name.slice('react:'.length) as MessageReactionEmoji);
    return;
  }
  if ((SIMPLE_BUBBLE_ACTIONS as readonly string[]).includes(name)) {
    handlers[name as (typeof SIMPLE_BUBBLE_ACTIONS)[number]]();
  }
}

type BubbleInteractionMode = {
  /** Tombstone: confirm removal; failed: retry; voice: play / pause; plain text: nothing. */
  press: 'expired' | 'retry' | 'voice' | null;
  longPress: 'expired' | 'failed' | 'cancelSending' | 'report' | 'none' | 'picker';
};

function bubbleInteractionMode(params: {
  expired: boolean;
  failed: boolean;
  outboxId: string | null;
  isVoice: boolean;
  canReact: boolean;
  copyable: boolean;
  canSave: boolean;
  isOwn: boolean;
  sending: boolean;
  /** Reply / edit / unsend / forward: the menu has something to offer. */
  hasMenuActions: boolean;
}): BubbleInteractionMode {
  if (params.expired) return { press: 'expired', longPress: 'expired' };
  if (params.failed && params.outboxId) return { press: 'retry', longPress: 'failed' };
  // Still waiting for moderation / delivery: the sender may cancel it.
  if (params.sending && params.outboxId) return { press: null, longPress: 'cancelSending' };
  const press = params.isVoice ? 'voice' : null;
  // Offline or still sending: no reactions, but Copy / Save (and Report) stay available.
  if (!params.canReact && !params.copyable && !params.canSave && !params.hasMenuActions) {
    return { press, longPress: params.isOwn ? 'none' : 'report' };
  }
  return { press, longPress: 'picker' };
}

function confirmExpiredOutbox(t: ChatScreenViewModel['t'], remove: () => void) {
  Alert.alert(t('chat.sendExpiredTitle'), t('chat.sendExpiredMessage'), [
    { text: t('chat.deleteFailed'), style: 'destructive', onPress: remove },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}

function showFailedOutboxActions(
  t: ChatScreenViewModel['t'],
  actions: { retry: () => void; copy: (() => void) | null; remove: () => void },
) {
  Alert.alert(t('chat.sendFailedTitle'), undefined, [
    { text: t('chat.retrySend'), onPress: actions.retry },
    ...(actions.copy ? [{ text: t('chat.copy'), onPress: actions.copy }] : []),
    { text: t('chat.deleteFailed'), style: 'destructive' as const, onPress: actions.remove },
    { text: t('common.cancel'), style: 'cancel' as const },
  ]);
}

/** What VoiceOver reads as the content: the text, „Wiadomość głosowa, 0:12”, or nothing. */
function bubbleAccessibilityBody(
  t: ChatScreenViewModel['t'],
  params: { expired: boolean; voiceDurationMs: number | null; body: string },
): string {
  if (params.expired) return '';
  if (params.voiceDurationMs !== null) {
    return t('chat.voiceMessageA11y', { duration: formatVoiceDuration(params.voiceDurationMs) });
  }
  return params.body;
}

/** Pill text and VoiceOver text of a reply's quoted header. */
function nixReplyTexts(
  t: ChatScreenViewModel['t'],
  isOwn: boolean,
): { label: string; a11y: string } {
  // My reply answers the peer's NiX; the peer's reply answers mine (see chatNixReplyContext).
  // The pill carries no name: in a 1:1 chat it is redundant, and Polish would need the genitive
  // ("od Damiana") — the undeclined name read wrong and truncated the pill.
  return isOwn
    ? { label: t('chat.replyToPeerNix'), a11y: t('chat.a11yReplyToPeerNix') }
    : { label: t('chat.replyToYourNix'), a11y: t('chat.a11yReplyToYourNix') };
}

/** VoiceOver text of the save state, or `null`. */
function savedAccessibilityText(
  t: ChatScreenViewModel['t'],
  savedBy: 'me' | 'peer' | null,
  peerName: string,
): string | null {
  if (savedBy === 'me') return t('chat.a11ySavedByYou');
  if (savedBy === 'peer') return t('chat.a11ySavedByPeer', { name: peerName });
  return null;
}

const EMPTY_WAVEFORM: readonly number[] = [];
const NOOP = () => undefined;
/** Two taps on a text bubble within this window open the Tapback bar (iMessage). */
const DOUBLE_TAP_MS = 300;
/** What a bubble asks the screen to show; the screen converts the frame to its own coordinates. */
type BubbleOverlayRequest = Omit<MessageOverlayRequest, 'target'> & {
  messageId: string;
  isOwn: boolean;
  frame: { x: number; y: number; width: number; height: number };
};

/**
 * Memoized with primitive props and id-keyed stable handlers (PERF-10): a re-render of the
 * screen (new data, picker focus elsewhere) skips every bubble whose own data did not change.
 */
const MessageBubble = memo(function MessageBubble({
  messageId,
  body,
  createdAt,
  locale,
  isOwn,
  senderName,
  peerName,
  isOptimistic,
  outboxStatus,
  outboxId,
  receipt,
  maxWidth,
  reactions,
  currentUserId,
  canReact,
  canCopy,
  group,
  savedBy,
  canSave,
  voiceDurationMs,
  voiceWaveform,
  replyToNixId,
  replyToNixKind,
  replyToNixInTimeline,
  quoteAuthor,
  quoteSnippet,
  quoteIsVoice,
  quoteMessageId,
  quoteInTimeline,
  edited,
  highlighted,
  actions,
  onReact,
  onRemoveReaction,
  onOpenOverlay,
  onCopy,
  onReport,
  onRetry,
  onDeleteOutbox,
  onCancelSending,
  onSetSaved,
  onToggleVoice,
  onShowRepliedNix,
  onReply,
  onEdit,
  onUnsend,
  onForward,
  onShowQuotedMessage,
}: MessageBubbleProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const expired = outboxStatus === 'expired';
  const failed = outboxStatus === 'failed';
  const isVoice = voiceDurationMs !== null;
  const voicePhase = useVoicePhase(messageId, isVoice);
  const { bubbleBg, labelColor } = bubbleColors(colors, expired, isOwn);
  const ownReactionBg = colors.accent;
  const peerReactionBg = colors.chatBubbleIncoming;
  const hasReactions = reactions.length > 0;
  const motionEnabled = useMotionEnabled();
  const copyable = canCopy && !isVoice && !expired && body.trim().length > 0;
  const shape = chatBubbleShape(group, isOwn);
  const voice = useMemo<BubbleVoiceProps | null>(
    () =>
      voiceDurationMs === null
        ? null
        : { durationMs: voiceDurationMs, waveform: voiceWaveform ?? EMPTY_WAVEFORM },
    [voiceDurationMs, voiceWaveform],
  );

  const confirmExpired = () => {
    if (outboxId) confirmExpiredOutbox(t, () => onDeleteOutbox(outboxId));
  };

  const mode = bubbleInteractionMode({
    expired,
    failed,
    outboxId,
    isVoice,
    canReact,
    copyable,
    canSave,
    isOwn,
    sending: outboxStatus === 'sending',
    hasMenuActions: actions.reply || actions.edit || actions.unsend || actions.forward,
  });

  /** Long press outside the system menu: tombstones, failed / sending texts, offline report. */
  const onLongPressBubble = () => {
    switch (mode.longPress) {
      case 'expired':
        confirmExpired();
        return;
      case 'failed':
        if (outboxId) {
          showFailedOutboxActions(t, {
            retry: () => onRetry(outboxId),
            copy: copyable ? () => onCopy(messageId) : null,
            remove: () => onDeleteOutbox(outboxId),
          });
        }
        return;
      case 'cancelSending':
        if (outboxId) {
          Alert.alert(t('chat.sendingTitle'), undefined, [
            { text: t('chat.cancelSending'), style: 'destructive', onPress: () => onCancelSending(outboxId) },
            { text: t('common.close'), style: 'cancel' },
          ]);
        }
        return;
      case 'report':
        onReport(messageId);
        return;
      default:
        // `none`, and `picker`: the system context menu handles that long press itself.
        return;
    }
  };

  const pressHandlers = {
    expired: confirmExpired,
    retry: () => (outboxId ? onRetry(outboxId) : undefined),
    voice: () => onToggleVoice(messageId),
  };
  const onPress = mode.press ? pressHandlers[mode.press] : undefined;

  const myEmoji = reactions.find((reaction) => reaction.user_id === currentUserId)?.emoji ?? null;
  const statusText = outboxStatusText(outboxStatus);
  const replyContext: ChatNixReplyContext | null =
    replyToNixId && !expired
      ? {
          nixId: replyToNixId,
          kind: replyToNixKind,
          nixOwner: isOwn ? 'peer' : 'mine',
          inTimeline: replyToNixInTimeline,
        }
      : null;
  const replyTexts = replyContext ? nixReplyTexts(t, isOwn) : null;
  const hasQuote = quoteAuthor !== null && !expired;
  const quoteText = quoteIsVoice ? t('chat.quotedVoice') : quoteSnippet;
  const quoteA11y = hasQuote ? t('chat.a11yReplyToMessage', { author: quoteAuthor, text: quoteText }) : null;
  const accessibilityLabel = chatMessageAccessibilityLabel({
    sender: senderName,
    body: bubbleAccessibilityBody(t, { expired, voiceDurationMs, body }),
    replyContext: [replyTexts?.a11y, quoteA11y].filter(Boolean).join(', ') || null,
    time: formatChatTime(createdAt, locale),
    edited: edited ? t('chat.a11yEdited') : null,
    status: statusText,
    saved: savedAccessibilityText(t, savedBy, peerName),
    reactions: reactions.map((reaction) => ({
      glyph: MESSAGE_REACTION_GLYPHS[reaction.emoji],
      by: reaction.user_id === currentUserId ? t('chat.a11yYou') : peerName,
    })),
    formatReactions: (list) => t('chat.a11yReactions', { list }),
  });
  // Everything the long-press bar offers, reachable with the VoiceOver rotor.
  const accessibilityActions = bubbleAccessibilityActions(t, {
    playable: isVoice && !expired && !failed,
    playing: voicePhase === 'playing',
    canReact,
    myEmoji,
    canSave,
    saved: savedBy !== null,
    copyable,
    reportable: !isOwn && outboxStatus === null,
    retryable: failed && outboxId !== null,
    deletable: (failed || expired) && outboxId !== null,
    showRepliedNix: replyContext?.inTimeline === true,
    showQuoted: hasQuote && quoteInTimeline,
    messageActions: actions,
  });
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    runBubbleAccessibilityAction(event.nativeEvent.actionName, {
      activate: () => onPress?.(),
      react: (emoji) => onReact(messageId, emoji),
      toggleSave: () => onSetSaved(messageId, !savedBy),
      copy: () => onCopy(messageId),
      report: () => onReport(messageId),
      retry: () => (outboxId ? onRetry(outboxId) : undefined),
      delete: () => (outboxId ? onDeleteOutbox(outboxId) : undefined),
      showNix: () => (replyContext ? onShowRepliedNix(replyContext.nixId) : undefined),
      showQuoted: () => (quoteMessageId ? onShowQuotedMessage(quoteMessageId) : undefined),
      reply: () => onReply(messageId),
      edit: () => onEdit(messageId),
      forward: () => onForward(messageId),
      unsend: () => onUnsend(messageId),
    });
  };

  // The system context menu (Messages order): Reply, Copy, Edit, Forward, Save, then the
  // destructive Undo Send / Report.
  const nativeMenu = mode.longPress === 'picker';
  const menuActions: MessageActionMenuItem[] = [];
  if (nativeMenu) {
    if (actions.reply) {
      menuActions.push({ key: 'reply', section: 0, label: t('chat.reply'), icon: 'reply', destructive: false, onPress: () => onReply(messageId) });
    }
    if (copyable) {
      menuActions.push({ key: 'copy', section: 1, label: t('chat.copy'), icon: 'copy', destructive: false, onPress: () => onCopy(messageId) });
    }
    if (actions.edit) {
      menuActions.push({ key: 'edit', section: 1, label: t('chat.edit'), icon: 'edit', destructive: false, onPress: () => onEdit(messageId) });
    }
    if (actions.forward) {
      menuActions.push({ key: 'forward', section: 1, label: t('chat.forward'), icon: 'forward', destructive: false, onPress: () => onForward(messageId) });
    }
    if (canSave) {
      menuActions.push({
        key: 'save',
        section: 1,
        label: savedBy ? t('chat.unsaveMessage') : t('chat.saveMessage'),
        icon: savedBy ? 'unsaveMessage' : 'saveMessage',
        destructive: false,
        onPress: () => onSetSaved(messageId, !savedBy),
      });
    }
    if (actions.unsend) {
      menuActions.push({ key: 'unsend', section: 2, label: t('chat.unsend'), icon: 'unsend', destructive: true, onPress: () => onUnsend(messageId) });
    }
    if (!isOwn && outboxStatus === null) {
      menuActions.push({ key: 'report', section: 2, label: t('chat.reportMessage'), icon: 'report', destructive: true, onPress: () => onReport(messageId) });
    }
  }
  // Double tap opens the Tapback bar on a text bubble; a voice bubble's single tap plays it.
  const bubbleRef = useRef<View>(null);
  const doubleTapEnabled = canReact && !isVoice && mode.press === null;
  // The copy that lifts above the blur on long press (its badge does nothing there).
  const previewContent = (
    <MessageBubbleContent
      messageId={messageId}
      body={body}
      voice={voice}
      outboxStatus={outboxStatus}
      isOwn={isOwn}
      group={group}
      bubbleBg={bubbleBg}
      labelColor={labelColor}
      reactions={reactions}
      currentUserId={currentUserId}
      ownReactionBg={ownReactionBg}
      peerReactionBg={peerReactionBg}
      onPressBadge={NOOP}
    />
  );
  const openOverlay = (overlayMode: MessageOverlayRequest['mode']) => {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      selection();
      onOpenOverlay({
        mode: overlayMode,
        messageId,
        isOwn,
        canReact,
        frame: { x, y, width, height },
        // A clear copy of the bubble lifts above the blur (badges and tail included).
        preview: overlayMode === 'menu' ? previewContent : null,
        actions: overlayMode === 'menu' ? menuActions : [],
      });
    });
  };
  const openTapback = () => openOverlay('tapback');
  const lastTapAtRef = useRef(0);
  const onBubblePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (!doubleTapEnabled) return;
    const now = Date.now();
    if (now - lastTapAtRef.current < DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0;
      openTapback();
    } else {
      lastTapAtRef.current = now;
    }
  };
  const bubbleContent = (
    <MessageBubbleContent
      messageId={messageId}
      body={body}
      voice={voice}
      outboxStatus={outboxStatus}
      isOwn={isOwn}
      group={group}
      bubbleBg={bubbleBg}
      labelColor={labelColor}
      reactions={reactions}
      currentUserId={currentUserId}
      ownReactionBg={ownReactionBg}
      peerReactionBg={peerReactionBg}
      onPressBadge={nativeMenu ? openTapback : onLongPressBubble}
    />
  );
  const bubblePressableInner = (
    <Pressable
      onPress={onBubblePress}
      onLongPress={nativeMenu ? () => openOverlay('menu') : onLongPressBubble}
      delayLongPress={350}
      accessible
      // A plain message is text; a voice note plays, a failed / expired bubble acts on a tap.
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.bubblePressable}>
      {bubbleContent}
    </Pressable>
  );
  const bubblePressable = (
    <View ref={bubbleRef} collapsable={false}>
      {bubblePressableInner}
    </View>
  );

  return (
    <View
      style={[
        styles.row,
        { paddingTop: shape.paddingTop, paddingBottom: shape.paddingBottom },
        hasReactions ? styles.rowWithReactions : null,
        // A saved message keeps its bubble; the „Zapisane przez …” marker below says so. (A grey
        // band behind it swallowed incoming bubbles of the same grey.)
        highlighted ? { backgroundColor: colors.systemFill } : null,
      ]}>
      <SwipeToReply
        enabled={actions.reply}
        onReply={() => onReply(messageId)}
        style={[styles.bubbleAnchor, isOwn ? styles.bubbleOwn : styles.bubbleIncoming, { maxWidth }]}>
      <Animated.View
        entering={
          motionEnabled && isOptimistic ? FadeIn.duration(duration.fast) : undefined
        }
        style={[
          styles.bubbleAnchor,
          isOwn ? styles.bubbleOwn : styles.bubbleIncoming,
        ]}>
        {hasQuote ? (
          <MessageReplyHeader
            author={quoteAuthor}
            snippet={quoteText}
            isVoice={quoteIsVoice}
            isOwn={isOwn}
            onPress={quoteMessageId && quoteInTimeline ? () => onShowQuotedMessage(quoteMessageId) : null}
          />
        ) : null}
        {replyContext && replyTexts ? (
          <NixReplyHeader
            context={replyContext}
            label={replyTexts.label}
            isOwn={isOwn}
            onPress={onShowRepliedNix}
          />
        ) : null}
        {bubblePressable}
        {edited && !expired ? <EditedMarker isOwn={isOwn} /> : null}
        {savedBy ? <SavedMarker savedBy={savedBy} peerName={peerName} isOwn={isOwn} /> : null}
        {receipt ? <MessageReceipt status={receipt} /> : null}
      </Animated.View>
      </SwipeToReply>
    </View>
  );
});

/** „Edytowano” under an edited bubble, on its side (iMessage „Edited”). */
function EditedMarker({ isOwn }: { isOwn: boolean }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.savedRow, isOwn ? styles.savedRowOwn : styles.savedRowIncoming]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={[styles.savedText, { color: colors.secondaryLabel }]}>{t('chat.edited')}</Text>
    </View>
  );
}

function MessageReceipt({ status }: { status: 'delivered' | 'opened' }) {
  const { colors } = useAppTheme();
  const presentation = messageStatusPresentation(status, 'text');
  return (
    <View style={styles.receiptRow} accessibilityRole="text">
      <SymbolView
        name={resolveAppIconName(presentation.icon)}
        size={APP_ICON_SIZE.xs - 3}
        tintColor={messageStatusColor(presentation.tone, colors)}
        weight="semibold"
      />
      <Text style={[styles.receiptText, { color: colors.secondaryLabel }]}>
        {i18n.t(presentation.labelKey)}
      </Text>
    </View>
  );
}

function nixStatusLabel(
  nix: ChatNixEvent,
  t: ChatScreenViewModel['t'],
  now: Date = new Date()
): string {
  if (nix.direction === 'sent') {
    return t(messageStatusPresentation(outgoingNixStatus(nix), messageKindForMedia(nix.media_type)).labelKey);
  }
  // Received chips name the action while one is available, like Snapchat's "Tap to view".
  if (isNixFirstOpenAvailable(nix)) return t('chat.nixNew');
  if (isNixReplayAvailable(nix, now)) return t('chat.nixReplay');
  // The title already says „Otrzymano NiX-a”; the status line says what happened since: opened
  // (or replayed) — the same words the sender sees, not a second „Otrzymano”.
  return t(
    messageStatusPresentation(nix.replayed_at ? 'replayed' : 'opened', messageKindForMedia(nix.media_type))
      .labelKey
  );
}

function nixChipStatus(nix: ChatNixEvent): MessageStatus {
  if (nix.direction === 'sent') return outgoingNixStatus(nix);
  return incomingNixStatus(nix);
}

function nixTitle(nix: ChatNixEvent, t: ChatScreenViewModel['t']): string {
  return nix.direction === 'sent' ? t('chat.nixSentLabel') : t('chat.nixReceivedLabel');
}

const NixChip = memo(function NixChip({
  nix,
  reaction,
  maxWidth,
  highlighted,
  onOpen,
  onReport,
  t,
}: {
  nix: ChatNixEvent;
  /** The receiver's tapback on this NiX, drawn on the chip's outer corner like message reactions. */
  reaction: MessageReactionEmoji | null;
  maxWidth: number;
  /** Briefly ringed after a reply's quoted header scrolled here. */
  highlighted: boolean;
  onOpen: (nixId: string) => void;
  /** Received NiXes only: long press (or the VoiceOver action) opens the report reasons. */
  onReport: (nixId: string) => void;
  t: ChatScreenViewModel['t'];
}) {
  const { colors } = useAppTheme();
  const isOwn = nix.direction === 'sent';
  const motionEnabled = useMotionEnabled();
  const highlightOpacity = useSharedValue(0);
  useEffect(() => {
    const target = highlighted ? 1 : 0;
    // Reduce Motion: the ring simply appears and disappears.
    highlightOpacity.set(
      motionEnabled ? withTiming(target, { duration: highlighted ? duration.fast : duration.slow }) : target
    );
  }, [highlighted, highlightOpacity, motionEnabled]);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlightOpacity.get() }));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!nix.is_viewed || nix.is_replayed || !nix.replay_expires_at) return;
    const expiresAt = Date.parse(nix.replay_expires_at);
    if (!Number.isFinite(expiresAt)) return;
    const delayMs = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => setNowMs(Date.now()), delayMs);
    return () => clearTimeout(timer);
  }, [nix.is_viewed, nix.is_replayed, nix.replay_expires_at]);

  const now = new Date(nowMs);
  const canFirstOpen = isNixFirstOpenAvailable(nix);
  const canReplay = isNixReplayAvailable(nix, now);
  const isHighlighted = canFirstOpen || canReplay;
  const bubbleBg = isHighlighted ? colors.accent : colors.secondarySystemFill;
  const titleColor = isHighlighted ? colors.onChatBubbleOwn : colors.label;
  const statusColor = isHighlighted ? colors.onChatBubbleOwn : colors.secondaryLabel;

  // The leading symbol already says photo or video.
  const statusText = nixStatusLabel(nix, t, now);

  const statusPresentation = messageStatusPresentation(nixChipStatus(nix), messageKindForMedia(nix.media_type));
  const statusIconColor = isHighlighted
    ? colors.onChatBubbleOwn
    : messageStatusColor(statusPresentation.tone, colors);
  // The status symbol leads the chip, large, like Snapchat's chat rows; the text follows.
  const chip = (
    <View style={[styles.bubble, styles.chipLayout, { backgroundColor: bubbleBg }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.nixHighlightRing, { borderColor: colors.accentText }, highlightStyle]}
      />
      <SymbolView
        name={resolveAppIconName(statusPresentation.icon)}
        size={APP_ICON_SIZE.xxl}
        tintColor={statusIconColor}
        weight="medium"
      />
      <View style={styles.chipTextColumn}>
        <Text style={[styles.chipTitle, { color: titleColor }]}>{nixTitle(nix, t)}</Text>
        <Text style={[styles.chipStatus, { color: statusColor }]}>{statusText}</Text>
      </View>
      {reaction ? (
        <NixReactionBadge
          emoji={reaction}
          accessibility="decorative"
          style={[styles.nixReactionBadge, isOwn ? styles.reactionBadgesOwn : styles.reactionBadgesIncoming]}
        />
      ) : null}
    </View>
  );

  const anchorStyle = [
    styles.bubbleAnchor,
    isOwn ? styles.bubbleOwn : styles.bubbleIncoming,
    { maxWidth },
  ];
  const open = () => onOpen(nix.id);
  const reactionA11y = reaction
    ? `, ${t('viewer.nixReactionBadgeA11y', { emoji: MESSAGE_REACTION_GLYPHS[reaction] })}`
    : '';
  const title = `${nixTitle(nix, t)}${reactionA11y}`;
  const report = isOwn ? undefined : () => onReport(nix.id);
  const reportAction = report ? [{ name: 'report', label: t('chat.reportNix') }] : [];
  const onReportAction = (actionName: string) => {
    if (actionName === 'report') report?.();
  };

  if (canFirstOpen) {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={open}
          onLongPress={report}
          delayLongPress={350}
          accessibilityRole="button"
          // Status for the label, instruction for the hint: never the same sentence twice.
          accessibilityLabel={`${title}, ${t('chat.nixNewA11y')}`}
          accessibilityHint={t('chat.nixOpenHint')}
          accessibilityActions={reportAction}
          onAccessibilityAction={(event) => onReportAction(event.nativeEvent.actionName)}
          style={anchorStyle}>
          {chip}
        </Pressable>
      </View>
    );
  }

  if (canReplay) {
    // Replay stays a deliberate long press for sighted users; VoiceOver gets a named action
    // („Odtwórz”) instead of „double-tap and hold”.
    return (
      <View style={styles.row}>
        <Pressable
          onLongPress={open}
          delayLongPress={350}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${t('chat.nixReplayableA11y')}`}
          // Long press already replays; the viewer has Report, and VoiceOver gets it here too.
          accessibilityActions={[{ name: 'replay', label: t('chat.nixReplayAction') }, ...reportAction]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'replay') open();
            else onReportAction(event.nativeEvent.actionName);
          }}
          style={anchorStyle}>
          {chip}
        </Pressable>
      </View>
    );
  }

  if (report) {
    // Opened and gone: it can still be reported (e.g. when it disappeared before the report).
    return (
      <View style={styles.row}>
        <Pressable
          onLongPress={report}
          delayLongPress={350}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${title}, ${statusText}`}
          accessibilityActions={reportAction}
          onAccessibilityAction={(event) => onReportAction(event.nativeEvent.actionName)}
          style={anchorStyle}>
          {chip}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View
        style={anchorStyle}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}, ${statusText}`}>
        {chip}
      </View>
    </View>
  );
});

function uploadStatusLabel(job: DurableUploadJob, t: ChatScreenViewModel['t']): string {
  switch (job.state) {
    case 'staging':
    case 'queued':
    case 'preparing':
    case 'requesting_target':
      return t('chat.uploadPreparing');
    case 'uploading':
      return t('chat.uploadActive');
    // Uploaded, moderation runs in the background: the sender sees „Wysłano”.
    case 'finalizing':
      return t('chat.uploadCompleted');
    case 'waiting_network':
      return t('chat.uploadWaitingNetwork');
    case 'retry_scheduled':
      return t('chat.uploadRetrying');
    case 'waiting_for_auth':
    case 'failed':
      return t('chat.uploadTryAgain');
    case 'paused':
      return t('chat.uploadPaused');
    case 'completed':
    case 'partially_completed':
      return t('chat.uploadCompleted');
    case 'cancelled':
      return t('chat.uploadCancelled');
    case 'expired':
      return t('chat.uploadExpired');
  }
}

function isUploadFailureState(job: DurableUploadJob) {
  return job.state === 'waiting_for_auth' || job.state === 'failed';
}

/** Native SwiftUI progress, like the inbox: a ring while bytes move, a spinner otherwise. */
function MediaProgress({ progress, color }: { progress: number | null; color: string }) {
  return (
    <Host matchContents>
      <ProgressView
        value={progress ?? undefined}
        modifiers={[
          progressViewStyle('circular'),
          frame({ width: 22, height: 22 }),
          tint(color),
          accessibilityHidden(),
        ]}
      />
    </Host>
  );
}

const MEDIA_BUBBLE_ICONS: Record<ChatMediaBubbleIcon, AppIconName> = {
  retry: 'retry',
  completed: 'checkCircleFill',
  offline: 'offline',
  paused: 'pauseCircleFill',
  failed: 'warningFill',
};

function MediaBubbleAccessory({
  presentation,
  onRetry,
  statusColor,
  t,
}: {
  presentation: ChatMediaBubblePresentation;
  onRetry: () => void;
  statusColor: string;
  t: ChatScreenViewModel['t'];
}) {
  const { colors } = useAppTheme();
  const { busy, icon, progress } = presentation;
  if (busy || !icon) {
    return (
      <View style={styles.uploadAccessory}>
        <MediaProgress progress={progress} color={colors.accentText} />
      </View>
    );
  }
  if (icon === 'retry') {
    return (
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('chat.uploadRetry')}
        hitSlop={4}
        style={({ pressed }) => [styles.uploadAccessory, pressed ? styles.uploadRetryPressed : null]}>
        <AppIcon name={MEDIA_BUBBLE_ICONS.retry} size={APP_ICON_SIZE.lg} color={colors.destructive} />
      </Pressable>
    );
  }
  return (
    <View style={styles.uploadAccessory}>
      <AppIcon name={MEDIA_BUBBLE_ICONS[icon]} size={APP_ICON_SIZE.lg} color={statusColor} />
    </View>
  );
}

function mediaBubbleStatus(
  job: DurableUploadJob | null,
  nix: ChatNixEvent | null,
  busyAction: UploadRowAction | null,
  t: ChatScreenViewModel['t']
): string {
  if (nix) return nixStatusLabel(nix, t);
  if (busyAction === 'retry') return t('chat.uploadActive');
  return job ? uploadStatusLabel(job, t) : '';
}

type OutgoingMediaBubbleProps = {
  jobId: string;
  job: DurableUploadJob | null;
  /** The delivered server NiX once it exists; it replaces the job's content in place. */
  nix: ChatNixEvent | null;
  busyAction: UploadRowAction | null;
  maxWidth: number;
  onOpenActions: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onAction: (jobId: string, action: ChatUploadAction) => void;
  t: ChatScreenViewModel['t'];
};

/**
 * One cell for an outgoing photo/video from the first upload tick to the delivered NiX (SEND-8).
 * Every state keeps the same structure (two text lines + a fixed 36 pt accessory), so the height
 * does not change when the upload turns into the server NiX and nothing below it jumps.
 */
const OutgoingMediaBubble = memo(function OutgoingMediaBubble({
  jobId,
  job,
  nix,
  busyAction,
  maxWidth,
  onOpenActions,
  onRetry,
  onAction,
  t,
}: OutgoingMediaBubbleProps) {
  const { colors } = useAppTheme();
  const presentation = chatMediaBubblePresentation(job, nix, busyAction);
  const statusColor = {
    neutral: colors.secondaryLabel,
    success: colors.success,
    destructive: colors.destructive,
  }[presentation.tone];
  const title = presentation.failed
    ? t('chat.uploadFailureTitle')
    : presentation.mediaType === 'video'
      ? t('chat.uploadVideoTitle')
      : t('chat.uploadPhotoTitle');
  const status = mediaBubbleStatus(job, nix, busyAction, t);
  const hasActions = presentation.actions.length > 0;
  const { progress } = presentation;

  return (
    <View style={styles.row}>
      <View style={[styles.bubbleAnchor, styles.bubbleOwn, { maxWidth }]}>
        <Pressable
          disabled={presentation.busy || !hasActions}
          delayLongPress={350}
          onLongPress={() => onOpenActions(jobId)}
          accessibilityRole={hasActions ? 'button' : undefined}
          // The label stays the same while bytes move; the percentage goes to the value so
          // VoiceOver does not re-read the whole bubble on every progress tick (SEND-14).
          accessibilityLabel={`${title}. ${status}`}
          accessibilityValue={
            progress === null ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }
          }
          accessibilityHint={hasActions ? t('chat.uploadActionsHint') : undefined}
          // The nested retry button is hidden behind this label; VoiceOver reaches Retry / Resume /
          // Cancel through the actions rotor instead.
          accessibilityActions={presentation.actions.map((action) => ({
            name: action,
            label: chatUploadActionLabel(t, action),
          }))}
          onAccessibilityAction={(event) => {
            const action = presentation.actions.find(
              (candidate) => candidate === event.nativeEvent.actionName
            );
            if (action) onAction(jobId, action);
          }}
          style={({ pressed }) => [
            styles.bubble,
            styles.uploadBubble,
            { backgroundColor: colors.secondarySystemFill },
            pressed ? styles.uploadBubblePressed : null,
          ]}>
          <View style={styles.uploadContent}>
            <View style={styles.uploadHeading}>
              <Text numberOfLines={1} style={[styles.chipTitle, { color: colors.label }]}>
                {title}
              </Text>
              <Text numberOfLines={1} style={[styles.chipStatus, { color: statusColor }]}>
                {status}
              </Text>
            </View>
            <MediaBubbleAccessory
              presentation={presentation}
              onRetry={() => onRetry(jobId)}
              statusColor={statusColor}
              t={t}
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
});

function chatUploadActionLabel(t: ChatScreenViewModel['t'], action: ChatUploadAction) {
  if (action === 'retry') return t('chat.uploadRetry');
  if (action === 'resume') return t('chat.uploadResume');
  return t('chat.uploadCancel');
}

function requestChatUploadAction(
  vm: ChatScreenViewModel,
  job: DurableUploadJob,
  action: ChatUploadAction
) {
  const recipientCount = sharedRecipientCount(job);
  const isShared = recipientCount > 1;
  const needsConfirmation = isShared || action === 'cancel';
  if (!needsConfirmation) {
    void vm.handleUploadAction(job.id, action);
    return;
  }

  const actionLabel = chatUploadActionLabel(vm.t, action);
  Alert.alert(
    isShared ? vm.t('chat.uploadSharedActionTitle') : vm.t('chat.uploadCancelTitle'),
    isShared
      ? vm.t('chat.uploadSharedActionMessage', { count: recipientCount })
      : vm.t('chat.uploadCancelMessage'),
    [
      { text: vm.t('common.cancel'), style: 'cancel' },
      {
        text: actionLabel,
        style: action === 'cancel' ? 'destructive' : 'default',
        onPress: () => void vm.handleUploadAction(job.id, action),
      },
    ]
  );
}

function openChatUploadActions(vm: ChatScreenViewModel, job: DurableUploadJob) {
  const actions = chatUploadActions(job);
  if (actions.length === 0) return;
  selection();
  const labels = actions.map((action) => chatUploadActionLabel(vm.t, action));
  const failure = isUploadFailureState(job);
  const title = failure
    ? job.mediaType === 'video'
      ? vm.t('chat.uploadVideoFailureTitle')
      : vm.t('chat.uploadPhotoFailureTitle')
    : job.mediaType === 'video'
      ? vm.t('chat.uploadVideoTitle')
      : vm.t('chat.uploadPhotoTitle');
  const message = failure ? vm.t('chat.uploadFailureActionMessage') : undefined;

  const destructiveActionIndex = actions.indexOf('cancel');
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options: [vm.t('common.cancel'), ...labels],
      cancelButtonIndex: 0,
      destructiveButtonIndex:
        destructiveActionIndex >= 0 ? destructiveActionIndex + 1 : undefined,
    },
    (buttonIndex) => {
      if (buttonIndex == null || buttonIndex === 0) return;
      const action = actions[buttonIndex - 1];
      if (action) requestChatUploadAction(vm, job, action);
    }
  );
}

function DateSeparator({ label }: { label: string }) {
  const { colors } = useAppTheme();
  // A header, so the VoiceOver rotor can jump between days.
  return (
    <View style={styles.separatorRow} accessible accessibilityRole="header" accessibilityLabel={label}>
      <Text style={[styles.separatorText, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

function SystemMessageItem({ message }: { message: OptimisticTextMessage }) {
  const { colors } = useAppTheme();
  
  const textBody = 
    message.metadata?.type === 'capture_attempt' 
      ? i18n.t('chat.systemCaptureAttempt') 
      : message.body;
      
  return (
    <View style={styles.separatorRow}>
      <Text style={[styles.systemMessageText, { color: colors.secondaryLabel }]}>{textBody}</Text>
    </View>
  );
}

/**
 * Overlay nad FlashList — `GlassView` sampluje bąbelki pod spodem.
 * Layout stały (paddingBottom = safe-area); nad klawiaturę unosi go tylko `translateY` na wątku UI
 * (PERF-26), więc ruch klawiatury nie przelicza layoutu. Its measured height (multiline draft,
 * counter row) goes to `composerHeight`, which the list reads on the UI thread.
 *
 * Owns the draft text (PERF-10): a keystroke re-renders only this component, never the screen,
 * the header or the list cells.
 */
/** From this Dynamic Type scale (the accessibility sizes) the composer uses the short placeholder. */
const COMPOSER_SHORT_PLACEHOLDER_FONT_SCALE = 1.5;

const ChatComposer = memo(function ChatComposer({
  t,
  keyboardHeight,
  restingPad,
  pasteInputEnabled,
  pasteImporting,
  onPaste,
  onSend,
  composerHeight,
  onDraftChange,
  onDraftBlur,
  onOpenCamera,
  voiceEnabled,
  voiceAvailable,
  onSendVoice,
  onVoiceRecordingStart,
  context,
  onCancelContext,
}: ChatComposerProps) {
  const { colors, colorScheme } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const [text, setText] = useState('');
  // Bumped only to put text back after a failed enqueue (remount with `defaultValue`). A normal
  // send clears the native input in place, so it keeps focus and the keyboard stays up.
  const [inputKey, setInputKey] = useState(0);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const editing = context?.mode === 'edit';
  // A new edit puts the message's text into the input once (adjusting state during render).
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (context?.seedText != null && context.key !== seededKey) {
    setSeededKey(context.key);
    setText(context.seedText);
    setInputKey((key) => key + 1);
  }
  // Reply / edit: the keyboard comes up on the input, like Messages.
  const contextKey = context?.key ?? null;
  useEffect(() => {
    if (!contextKey) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [contextKey]);
  const cancelContext = () => {
    // Leaving an edit drops the edited text; a reply keeps what was typed.
    if (editing) {
      inputRef.current?.clear();
      setText('');
      onDraftChange('');
    }
    onCancelContext();
  };
  const canSend = Boolean(text.trim()) && !sending;
  const useGlass = canUseLiquidGlass();
  const showCounter = shouldShowComposerCounter(text.length, TEXT_MESSAGE_MAX_LENGTH);
  const atLimit = text.length >= TEXT_MESSAGE_MAX_LENGTH;
  const inputMaxHeight =
    Math.ceil(typography.body.lineHeight * Math.max(1, fontScale) * COMPOSER_MAX_LINES)
    + COMPOSER_INPUT_VERTICAL_PAD * 2;

  // iOS has no live regions: announce the paste progress and the hard limit explicitly.
  useEffect(() => {
    if (pasteImporting) AccessibilityInfo.announceForAccessibility(t('chat.pastePreparingImage'));
  }, [pasteImporting, t]);
  useEffect(() => {
    if (atLimit) {
      AccessibilityInfo.announceForAccessibility(
        t('chat.characterLimit', { limit: TEXT_MESSAGE_MAX_LENGTH })
      );
    }
  }, [atLimit, t]);

  const changeText = (next: string) => {
    setText(next);
    onDraftChange(next);
  };

  const send = () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    inputRef.current?.clear();
    setText('');
    void onSend(body)
      .then((accepted) => {
        if (accepted) return;
        setText(body);
        setInputKey((key) => key + 1);
      })
      .finally(() => {
        sendingRef.current = false;
        setSending(false);
      });
  };

  const onLayout = (event: LayoutChangeEvent) => {
    composerHeight.set(event.nativeEvent.layout.height);
  };

  const composerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -chatKeyboardLift(keyboardHeight.get(), restingPad) }],
  }));

  const fallbackFill = { backgroundColor: colors.secondarySystemFill };
  /**
   * Jak scroll-edge pod headerem: tylko miękki fade do systemBackground.
   * BlurView tu zbierał kolor bąbelków (fioletowy „glow”) — nie jak u góry.
   */
  const bg = colors.systemBackground.length >= 7 ? colors.systemBackground.slice(0, 7) : colors.systemBackground;

  const inputField = (
    <TextInput
      key={inputKey}
      ref={inputRef}
      defaultValue={text}
      // At accessibility text sizes the full placeholder wrapped to three lines in the pill; the
      // short form stays on one line (the label below keeps the full wording for VoiceOver).
      placeholder={
        pasteImporting
          ? t('chat.pastePreparingImage')
          : fontScale >= COMPOSER_SHORT_PLACEHOLDER_FONT_SCALE
            ? t('chat.typeMessageShort')
            : t('chat.typeMessage')
      }
      placeholderTextColor={colors.secondaryLabel}
      onChangeText={changeText}
      onBlur={onDraftBlur}
      maxLength={TEXT_MESSAGE_MAX_LENGTH}
      // Return inserts a new line (iMessage); the send button sends.
      multiline
      scrollEnabled
      accessibilityLabel={t('chat.typeMessage')}
      accessibilityState={{ busy: pasteImporting }}
      style={[styles.inputText, { color: colors.label, maxHeight: inputMaxHeight }]}
    />
  );

  const composerInput = pasteInputEnabled ? (
    <TextInputWrapper onPaste={onPaste} style={styles.pasteInputWrapper}>
      {inputField}
    </TextInputWrapper>
  ) : (
    inputField
  );

  /**
   * Camera, Send, the mic, Stop and voice Send are native SwiftUI glass buttons (one press
   * response, from the glass).
   */
  const composerButton = {
    size: COMPOSER_CONTROL_SIZE,
    iconSize: APP_ICON_SIZE.md,
    iconWeight: 'semibold' as const,
    // Pure glass on iOS 26+; the gray capsule below it, where `glassEffect` draws nothing.
    backgroundColor: useGlass ? 'transparent' : colors.secondarySystemFill,
    tintColor: colors.accentText,
    colorScheme,
  };

  // The mic replaces Send while the draft is empty (iMessage). Tap records, Stop ends the take
  // for review, and only the explicit Send sends it — a stray touch can never send a recording.
  // Recording and review stay available if the connection drops meanwhile.
  const renderRow = (voice: ComposerVoiceState | null) => {
    const recording = voice?.recording ?? false;
    const pendingVoice = voice?.pending ?? null;
    const voiceBusy = recording || pendingVoice !== null;
    const showMic = voice !== null && !voiceBusy && voiceAvailable && !text.trim() && !editing;
    const voiceStrip =
      recording && voice ? (
        <VoiceRecordingStrip
          t={t}
          elapsedMs={voice.elapsedMs}
          level={voice.level}
          onCancel={() => void voice.cancelRecording()}
        />
      ) : pendingVoice && voice ? (
        <VoiceReviewStrip t={t} recording={pendingVoice} onDiscard={voice.discard} />
      ) : null;
    return (
      <View style={styles.composerRow}>
        <NativeChromeIconButton
          {...composerButton}
          name="camera"
          onPress={onOpenCamera}
          disabled={voiceBusy}
          accessibilityLabel={t('chat.openCamera')}
          accessibilityHint={t('chat.openCameraHint')}
        />

        {useGlass ? (
          <GlassView style={styles.inputGlass} glassEffectStyle="regular" isInteractive>
            {voiceStrip ?? composerInput}
          </GlassView>
        ) : (
          <View style={[styles.inputGlass, fallbackFill]}>
            {voiceStrip ?? composerInput}
          </View>
        )}

        {recording && voice ? (
          <NativeChromeIconButton
            {...composerButton}
            name="stopFill"
            tintColor={colors.destructive}
            onPress={() => void voice.stop()}
            accessibilityLabel={t('chat.voiceStop')}
          />
        ) : pendingVoice && voice ? (
          <NativeChromeIconButton
            {...composerButton}
            name="send"
            onPress={voice.send}
            accessibilityLabel={t('chat.voiceSendRecording')}
          />
        ) : showMic && voice ? (
          <NativeChromeIconButton
            {...composerButton}
            name="mic"
            onPress={() => void voice.start()}
            accessibilityLabel={t('chat.voiceRecord')}
            accessibilityHint={t('chat.voiceRecordHint')}
          />
        ) : (
          <NativeChromeIconButton
            {...composerButton}
            name={editing ? 'checkmark' : 'send'}
            onPress={send}
            disabled={!canSend}
            accessibilityLabel={editing ? t('chat.saveEdit') : t('chat.send')}
          />
        )}
      </View>
    );
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={onLayout}
      style={[styles.composerShell, { paddingBottom: restingPad }, composerStyle]}>
      {/* Follows the composer's own height: a taller draft gets a taller fade. */}
      <View pointerEvents="none" style={styles.composerEdgeFade}>
        <LinearGradient
          colors={[`${bg}00`, `${bg}D9`, `${bg}FF`]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ComposerContextPresence
        style={styles.composerContextRow}
        content={
          context
            ? {
                key: context.key,
                icon: context.mode === 'edit' ? 'edit' : 'reply',
                title: context.title,
                snippet: context.snippet,
                cancelLabel: context.mode === 'edit' ? t('chat.cancelEdit') : t('chat.cancelReply'),
              }
            : null
        }
        onCancel={cancelContext}
      />

      {voiceEnabled ? (
        <ComposerVoiceHost t={t} onSend={onSendVoice} onRecordingStart={onVoiceRecordingStart}>
          {renderRow}
        </ComposerVoiceHost>
      ) : (
        renderRow(null)
      )}

      {showCounter ? (
        <View style={styles.footerRow}>
          <Text
            style={[
              styles.footerCounter,
              { color: atLimit ? colors.destructive : colors.secondaryLabel },
            ]}
            accessibilityLabel={t('chat.characterCountA11y', {
              count: text.length,
              limit: TEXT_MESSAGE_MAX_LENGTH,
            })}>
            {`${text.length}/${TEXT_MESSAGE_MAX_LENGTH}`}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

/**
 * FlashList v2 opens the chat at the newest message itself (PERF-14: no top render + rAF jump)
 * and follows new content only while the reader is near the bottom. Module-level: FlashList
 * compares the object by reference.
 */
const MAINTAIN_VISIBLE_CONTENT_POSITION: FlashListProps<ChatTimelineEntry>['maintainVisibleContentPosition'] = {
  startRenderingFromBottom: true,
  autoscrollToBottomThreshold: 0.2,
};

type ChatListKeyboardBinding = {
  /** `contentInset.bottom` of the chat list: room for the risen composer. */
  contentInset: SharedValue<number>;
  /** `scrollIndicatorInsets.bottom`, updated only once the keyboard settles. */
  indicatorInset: SharedValue<number>;
  /** Live scroll offset, written on the UI thread by the scroll view's own events. */
  scrollOffset: SharedValue<number>;
  /** The native scroll view, for UI-thread `scrollTo`. */
  scrollRef: AnimatedRef<ScrollView>;
  /** Extra bottom inset while the composer is taller than one line. */
  composerExtra: SharedValue<number>;
};

const ChatListKeyboardContext = createContext<ChatListKeyboardBinding | null>(null);

/**
 * FlashList scroll component bound to the keyboard sync on the UI thread (PERF-26). Its bottom
 * insets change only when a keyboard movement starts or settles, so the list never re-lays out per
 * frame and React never re-renders for the keyboard. Module-level: FlashList memoizes it by identity.
 */
function ChatListScrollView({ ref, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const binding = use(ChatListKeyboardContext);
  const fallbackRef = useAnimatedRef<ScrollView>();
  const scrollRef = binding?.scrollRef ?? fallbackRef;
  useScrollOffset(scrollRef, binding?.scrollOffset);
  const setRefs = useCallback((node: ScrollView | null) => {
    scrollRef(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref, scrollRef]);
  const contentInset = binding?.contentInset;
  const indicatorInset = binding?.indicatorInset;
  const composerExtra = binding?.composerExtra;
  const animatedProps = useAnimatedProps(() => {
    const extra = composerExtra?.get() ?? 0;
    const content = (contentInset?.get() ?? 0) + extra;
    const indicator = (indicatorInset?.get() ?? 0) + extra;
    return {
      contentInset: { top: 0, left: 0, right: 0, bottom: content },
      scrollIndicatorInsets: { top: 0, left: 0, right: 0, bottom: indicator },
    };
  });
  // The marker puts the soft scroll edge effect on this exact scroll view: the stack's own lookup
  // follows the first-child chain of the screen and never reached the list (hard iOS 27 cutoff).
  return (
    <ScrollViewMarker style={styles.listMarker} scrollEdgeEffects={SOFT_SCROLL_EDGE_EFFECTS}>
      <Animated.ScrollView {...props} ref={setRefs} animatedProps={animatedProps} />
    </ScrollViewMarker>
  );
}

/**
 * Keeps the chat list glued above the composer while the keyboard moves (PERF-26).
 *
 * Everything runs on the UI thread: the composer rises with `translateY`, the list scrolls with
 * Reanimated `scrollTo` (no `scheduleOnRN` per frame) and its `contentInset` grows only at the
 * start of a movement and is trimmed to the exact lift once the keyboard settles. While the user
 * drags the list (interactive dismissal, momentum) the list is left alone and the next keyboard
 * movement re-anchors from wherever the user left it.
 *
 * `useAnimatedKeyboard` is deprecated in Reanimated 4 in favour of `react-native-keyboard-controller`,
 * which is a new native module (Xcode build). Until then it stays, with minimal per-frame work.
 */
function useChatKeyboardSync(
  keyboard: AnimatedKeyboardInfo,
  restingPad: number,
  hasList: boolean,
  composerHeight: SharedValue<number>,
  onScrolledUpChange: (scrolledUp: boolean) => void
) {
  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useSharedValue(0);
  const contentInset = useSharedValue(0);
  const indicatorInset = useSharedValue(0);
  const userScrolling = useSharedValue(false);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const listMounted = useSharedValue(false);
  const lastLift = useSharedValue(0);
  const anchor = useSharedValue<KeyboardScrollAnchor | null>(null);
  const scrolledUp = useSharedValue(false);
  const composerExtra = useDerivedValue(() => composerOverflow(composerHeight.get(), restingPad));

  useEffect(() => {
    listMounted.set(hasList);
  }, [hasList, listMounted]);

  useAnimatedReaction(
    () => ({
      lift: chatKeyboardLift(keyboard.height.get(), restingPad),
      state: keyboard.state.get(),
    }),
    ({ lift, state }) => {
      const previousLift = lastLift.get();
      lastLift.set(lift);
      const settled = state === KeyboardState.OPEN || state === KeyboardState.CLOSED;

      if (listMounted.get()) {
        if (userScrolling.get()) {
          anchor.set(null);
        } else if (anchor.get() !== null || (!settled && lift !== previousLift)) {
          let start = anchor.get();
          if (start === null) {
            start = { offset: scrollOffset.get(), lift: previousLift };
            anchor.set(start);
            // Room for the rising composer before the first scroll needs it.
            contentInset.set(Math.max(viewportHeight.get(), 1000));
          }
          const content = contentHeight.get();
          const viewport = viewportHeight.get();
          const maxAtRest = content > 0 && viewport > 0
            ? Math.max(0, content - viewport + composerExtra.get())
            : Number.POSITIVE_INFINITY;
          scrollTo(scrollRef, 0, keyboardScrollTarget(start, lift, maxAtRest), false);
        }
      }

      if (settled) {
        anchor.set(null);
        if (contentInset.get() !== lift) contentInset.set(lift);
        if (indicatorInset.get() !== lift) indicatorInset.set(lift);
      }
    }
  );

  // A taller draft (new line, counter row) pushes the conversation up with it, but only when the
  // reader is at the newest message; someone reading history is left where they are.
  useAnimatedReaction(
    () => composerExtra.get(),
    (extra, previousExtra) => {
      if (previousExtra === null || extra === previousExtra || !listMounted.get()) return;
      if (userScrolling.get() || anchor.get() !== null) return;
      const distance = distanceFromListEnd(
        scrollOffset.get(),
        contentHeight.get(),
        viewportHeight.get(),
        lastLift.get() + previousExtra
      );
      if (distance > 24) return;
      scrollTo(scrollRef, 0, Math.max(0, scrollOffset.get() + extra - previousExtra), false);
    }
  );

  // „Scroll to the newest” visibility, reported to React only when it flips (not per frame).
  // `lastLift` instead of the transient keyboard inset, so a moving keyboard never flashes it.
  useAnimatedReaction(
    () =>
      distanceFromListEnd(
        scrollOffset.get(),
        contentHeight.get(),
        viewportHeight.get(),
        lastLift.get() + composerExtra.get()
      ),
    (distance) => {
      const next = listMounted.get() && nextScrolledUpState(scrolledUp.get(), distance);
      if (next === scrolledUp.get()) return;
      scrolledUp.set(next);
      scheduleOnRN(onScrolledUpChange, next);
    }
  );

  const binding = useMemo<ChatListKeyboardBinding>(
    () => ({ contentInset, indicatorInset, scrollOffset, scrollRef, composerExtra }),
    [composerExtra, contentInset, indicatorInset, scrollOffset, scrollRef]
  );

  // Low-frequency list callbacks (gesture edges, size changes) feed the UI-thread math.
  const onScrollBeginDrag = useCallback(() => {
    userScrolling.set(true);
  }, [userScrolling]);
  const onScrollEndDrag = useCallback(() => {
    userScrolling.set(false);
  }, [userScrolling]);
  const onMomentumScrollBegin = useCallback(() => {
    userScrolling.set(true);
  }, [userScrolling]);
  const onMomentumScrollEnd = useCallback(() => {
    userScrolling.set(false);
  }, [userScrolling]);
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.set(height);
  }, [contentHeight]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.set(event.nativeEvent.layout.height);
  }, [viewportHeight]);

  return {
    binding,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    onContentSizeChange,
    onLayout,
  };
}

const EMPTY_REACTIONS: readonly MessageReaction[] = [];

const timelineKeyExtractor = (item: ChatTimelineEntry) => item.id;
const timelineItemType = (item: ChatTimelineEntry) => item.type;

/** A bubble the user has just created here: a fresh outbox text or a new outgoing upload. */
function isOwnFreshTimelineItem(item: ChatTimelineEntry, currentUserId: string) {
  if (item.type === 'media') return item.job !== null;
  if (item.type !== 'text') return false;
  const status = item.message.outboxStatus;
  return (
    item.message.sender_id === currentUserId
    && (status === 'sending' || status === 'waiting_network')
  );
}

/**
 * Something the user just sent always scrolls into view, even when they were reading history.
 * Incoming items and state changes of existing ones (stable keys) are left to
 * `autoscrollToBottomThreshold`; prepending older history never scrolls.
 */
function useFollowOwnNewItems(
  listRef: RefObject<FlashListRef<ChatTimelineEntry> | null>,
  timeline: readonly ChatTimelineEntry[],
  currentUserId: string
) {
  const timelineIdsRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const previousIds = timelineIdsRef.current;
    timelineIdsRef.current = new Set(timeline.map((item) => item.id));
    const last = timeline.at(-1);
    if (!previousIds || !last || previousIds.has(last.id)) return;
    if (!isOwnFreshTimelineItem(last, currentUserId)) return;
    const frameId = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [currentUserId, listRef, timeline]);
}

function openReportSheet(vm: ChatScreenViewModel, message: OptimisticTextMessage) {
  const reasons = vm.reportReasons;
  const labels = reasons.map((r) => r.label);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: [vm.t('common.cancel'), ...labels],
      cancelButtonIndex: 0,
    },
    (buttonIndex) => {
      if (buttonIndex == null || buttonIndex === 0) return;
      const reason = reasons[buttonIndex - 1];
      if (reason) void vm.handleReportMessage(message, reason.id);
    }
  );
}

function openNixReportSheet(vm: ChatScreenViewModel, nix: ChatNixEvent) {
  const reasons = vm.reportReasons;
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: vm.t('chat.reportNix'),
      options: [vm.t('common.cancel'), ...reasons.map((r) => r.label)],
      cancelButtonIndex: 0,
    },
    (buttonIndex) => {
      if (buttonIndex == null || buttonIndex === 0) return;
      const reason = reasons[buttonIndex - 1];
      if (reason) void vm.handleReportNix(nix, reason.id);
    }
  );
}

/**
 * Stable, id-keyed handlers for the memoized cells: they read the latest view model when called,
 * so `renderItem` does not depend on `vm` (PERF-10).
 */
function useChatTimelineHandlers(vm: ChatScreenViewModel) {
  const onReportMessage = useStableHandler((messageId: string) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) openReportSheet(vm, message);
  });
  const onReactToMessage = useStableHandler((messageId: string, emoji: MessageReactionEmoji) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) void vm.handleSetReaction(message, emoji);
  });
  const onRemoveReaction = useStableHandler((messageId: string) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) void vm.handleRemoveReaction(message);
  });
  const onCopyMessage = useStableHandler((messageId: string) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) void vm.handleCopyMessage(message);
  });
  const onSetSaved = useStableHandler((messageId: string, saved: boolean) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) void vm.handleSetSaved(message, saved);
  });
  const onUploadAction = useStableHandler((jobId: string, action: ChatUploadAction) => {
    const job = vm.chatUploadJobs.find((candidate) => candidate.id === jobId);
    if (job) requestChatUploadAction(vm, job, action);
  });
  const onRetryText = useStableHandler((outboxId: string) => {
    void vm.handleRetryTextMessage(outboxId);
  });
  const onDeleteOutbox = useStableHandler((outboxId: string) => {
    void vm.handleDeleteOutboxMessage(outboxId);
  });
  const onCancelSending = useStableHandler((outboxId: string) => {
    void vm.handleCancelSendingTextMessage(outboxId);
  });
  const onOpenNix = useStableHandler((nixId: string) => {
    const nix = vm.nixes.find((candidate) => candidate.id === nixId);
    if (!nix) return;
    vm.handleOpenNix(nix);
  });
  const onReportNix = useStableHandler((nixId: string) => {
    const nix = vm.nixes.find((candidate) => candidate.id === nixId);
    if (nix && nix.direction === 'received') openNixReportSheet(vm, nix);
  });
  const onOpenUploadActions = useStableHandler((jobId: string) => {
    const job = vm.chatUploadJobs.find((candidate) => candidate.id === jobId);
    if (job) openChatUploadActions(vm, job);
  });
  const withMessage = (messageId: string, run: (message: OptimisticTextMessage) => void) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    if (message) run(message);
  };
  const onReply = useStableHandler((messageId: string) => withMessage(messageId, vm.handleStartReply));
  const onEdit = useStableHandler((messageId: string) => withMessage(messageId, vm.handleStartEdit));
  const onUnsend = useStableHandler((messageId: string) =>
    withMessage(messageId, (message) => void vm.handleUnsendMessage(message)),
  );
  const onForward = useStableHandler((messageId: string) => withMessage(messageId, vm.handleForwardMessage));
  const messageActionsFor = useStableHandler((message: OptimisticTextMessage) => vm.messageActions(message));
  const onRetryUpload = useStableHandler((jobId: string) => {
    const job = vm.chatUploadJobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    selection();
    requestChatUploadAction(vm, job, 'retry');
  });
  return {
    onReportMessage,
    onReactToMessage,
    onRemoveReaction,
    onCopyMessage,
    onSetSaved,
    onUploadAction,
    onRetryText,
    onDeleteOutbox,
    onCancelSending,
    onOpenNix,
    onReportNix,
    onOpenUploadActions,
    onRetryUpload,
    onReply,
    onEdit,
    onUnsend,
    onForward,
    messageActionsFor,
  };
}

/**
 * The receipt sits under the conversation's last message only when that message is mine and
 * already on the server; a later reply or NiX makes it redundant (Snapchat/iMessage).
 */
function lastOwnServerTextId(timeline: readonly ChatTimelineEntry[], currentUserId: string): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.type === 'separator') continue;
    if (entry.type !== 'text') return null;
    const message = entry.message;
    if (message.is_system) continue;
    if (message.sender_id !== currentUserId || message.outboxStatus) return null;
    return message.id;
  }
  return null;
}

/** ContentUnavailableView-style state: large symbol, headline, explanation, one VoiceOver element. */
function ChatUnavailableState({
  icon,
  title,
  description,
}: {
  icon: AppIconName;
  title: string;
  description: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={styles.unavailable}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${description}`}>
      <SymbolView
        name={resolveAppIconName(icon)}
        size={44}
        tintColor={colors.secondaryLabel}
        weight="regular"
      />
      <Text style={[styles.emptyTitle, { color: colors.label }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>{description}</Text>
    </View>
  );
}

/** Loading, offline-without-cache (OFF-10), load error and empty states shown instead of the list. */
function ChatListPlaceholder({
  vm,
}: {
  vm: Pick<
    ChatScreenViewModel,
    'messagesLoading' | 'offlineCacheMissing' | 'messagesError' | 'refetchMessages' | 't'
  >;
}) {
  const { colors } = useAppTheme();
  if (vm.messagesLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.label} />
        <Text style={[styles.muted, { color: colors.secondaryLabel }]}>
          {vm.t('common.loading')}
        </Text>
      </View>
    );
  }
  if (vm.offlineCacheMissing) {
    return (
      <View style={styles.centered}>
        <ChatUnavailableState
          icon="offline"
          title={vm.t('chat.offlineNoCacheTitle')}
          description={vm.t('chat.offlineNoCacheMessage')}
        />
      </View>
    );
  }
  // A failed load must not read as "no messages yet".
  if (vm.messagesError) {
    return (
      <View style={styles.centered}>
        <ChatUnavailableState
          icon="warningFill"
          title={vm.t('chat.loadErrorTitle')}
          description={vm.t('chat.loadErrorDescription')}
        />
        <Host matchContents>
          <Button
            label={vm.t('common.retry')}
            variant="outlined"
            onPress={() => void vm.refetchMessages()}
          />
        </Host>
      </View>
    );
  }
  // The 24 h rule lives here and at the start of the history, not under the composer.
  return (
    <View style={styles.centered}>
      <ChatUnavailableState
        icon="statusTextOpened"
        title={vm.t('chat.emptyChatTitle')}
        description={vm.t('chat.emptyChatDescription')}
      />
    </View>
  );
}

/**
 * Glass „scroll to the newest” button above the composer, with a badge of incoming messages that
 * arrived while the reader was in older history. Rides the keyboard like the composer.
 */
function ScrollToBottomButton({
  visible,
  newCount,
  keyboardHeight,
  restingPad,
  composerHeight,
  onPress,
}: {
  visible: boolean;
  newCount: number;
  keyboardHeight: SharedValue<number>;
  restingPad: number;
  composerHeight: SharedValue<number>;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const useGlass = canUseLiquidGlass();
  const positionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -(
          chatKeyboardLift(keyboardHeight.get(), restingPad)
          + composerHeight.get()
          + SCROLL_BUTTON_GAP
        ),
      },
    ],
  }));
  const label =
    newCount > 0
      ? `${t('chat.scrollToBottom')}, ${t('chat.newMessagesCount', { count: newCount })}`
      : t('chat.scrollToBottom');
  const symbol = (
    <SymbolView
      name={resolveAppIconName('chevronDown')}
      size={APP_ICON_SIZE.md}
      tintColor={colors.label}
      weight="semibold"
    />
  );

  return (
    <Animated.View pointerEvents="box-none" style={[styles.scrollButtonShell, positionStyle]}>
      {/* Scale only, never opacity, on a GlassView ancestor; Reduce Motion: no animation. The
          shell stays mounted so the exit animation can run. */}
      {visible ? (
        <Animated.View
          entering={motionEnabled ? ZoomIn.duration(duration.medium) : undefined}
          exiting={motionEnabled ? ZoomOut.duration(duration.fast) : undefined}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={6}>
            {useGlass ? (
              <GlassView style={styles.scrollButton} glassEffectStyle="regular" isInteractive>
                {symbol}
              </GlassView>
            ) : (
              <View style={[styles.scrollButton, { backgroundColor: colors.secondarySystemFill }]}>
                {symbol}
              </View>
            )}
            {newCount > 0 ? (
              <View style={[styles.scrollBadge, { backgroundColor: colors.accent }]}>
                <Text
                  style={[styles.scrollBadgeText, { color: colors.onChatBubbleOwn }]}
                  maxFontSizeMultiplier={1.3}>
                  {newCount > 99 ? '99+' : String(newCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function chatPeerName(vm: Pick<ChatScreenViewModel, 'peerProfile' | 't'>): string {
  return (
    vm.peerProfile?.display_name?.trim()
    || (vm.peerProfile?.username ? `@${vm.peerProfile.username}` : null)
    || vm.t('chat.title')
  );
}

/** The unified timeline, with separators relative to a day clock that never goes stale. */
function useChatTimeline(vm: ChatScreenViewModel) {
  // Replaced only when the calendar day changes (midnight, focus, foreground): „Dziś” never lies.
  const dayClock = useCalendarDayClock();
  const { t, messages, nixes, locale, chatUploadJobs, mediaAnchors } = vm;
  const separatorLabels = useMemo<ChatSeparatorRelativeLabels>(
    () => ({
      today: (time) => t('chat.separatorToday', { time }),
      yesterday: (time) => t('chat.separatorYesterday', { time }),
    }),
    [t]
  );
  return useMemo(
    () =>
      buildUnifiedChatTimeline(
        messages,
        nixes,
        locale,
        dayClock,
        chatUploadJobs,
        mediaAnchors,
        separatorLabels
      ),
    [chatUploadJobs, dayClock, locale, mediaAnchors, messages, nixes, separatorLabels]
  );
}

/** How long the NiX chip stays ringed after a reply's header scrolled to it. */
const REPLIED_NIX_HIGHLIGHT_MS = 1400;

/**
 * Tapping a reply's quoted header (or its VoiceOver action) scrolls the list to the NiX it
 * answers and briefly rings that chip. A NiX outside the loaded timeline: nothing happens.
 */
function useRepliedNixJump(
  nixes: readonly ChatNixEvent[],
  timeline: readonly ChatTimelineEntry[],
  listRef: RefObject<FlashListRef<ChatTimelineEntry> | null>,
  motionEnabled: boolean
) {
  const [highlightedNixId, setHighlightedNixId] = useState<string | null>(null);
  const nixesById = useMemo(() => new Map(nixes.map((nix) => [nix.id, nix])), [nixes]);
  useEffect(() => {
    if (!highlightedNixId) return;
    const timer = setTimeout(() => setHighlightedNixId(null), REPLIED_NIX_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedNixId]);
  const onShowRepliedNix = useStableHandler((nixId: string) => {
    const index = chatTimelineNixIndex(timeline, nixId);
    if (index < 0) return;
    selection();
    void listRef.current?.scrollToIndex({ index, animated: motionEnabled, viewPosition: 0.5 });
    setHighlightedNixId(nixId);
  });
  return { highlightedNixId, nixesById, onShowRepliedNix };
}

/**
 * Tapping a quote (or its VoiceOver action) scrolls to the quoted message and briefly marks its
 * row. A message outside the loaded timeline: nothing happens.
 */
function useQuotedMessageJump(
  timeline: readonly ChatTimelineEntry[],
  listRef: RefObject<FlashListRef<ChatTimelineEntry> | null>,
  motionEnabled: boolean
) {
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const loadedMessageIds = useMemo(
    () => new Set(timeline.flatMap((item) => (item.type === 'text' ? [item.message.id] : []))),
    [timeline],
  );
  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = setTimeout(() => setHighlightedMessageId(null), REPLIED_NIX_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);
  const onShowQuotedMessage = useStableHandler((messageId: string) => {
    const index = chatTimelineMessageIndex(timeline, messageId);
    if (index < 0) return;
    selection();
    void listRef.current?.scrollToIndex({ index, animated: motionEnabled, viewPosition: 0.5 });
    setHighlightedMessageId(messageId);
  });
  return { highlightedMessageId, loadedMessageIds, onShowQuotedMessage };
}

/** The composer banner for the view model's reply / edit state. */
function composerContextView(
  context: ChatComposerContext | null,
  t: ChatScreenViewModel['t'],
  peerName: string,
): ComposerContextView | null {
  if (!context) return null;
  if (context.mode === 'edit') {
    return {
      mode: 'edit',
      key: `edit:${context.messageId}:${context.seed}`,
      title: t('chat.editingMessage'),
      snippet: '',
      seedText: context.body,
    };
  }
  return {
    mode: 'reply',
    key: `reply:${context.messageId}`,
    title: context.authorIsMe ? t('chat.replyingToSelf') : t('chat.replyingTo', { name: peerName }),
    snippet: context.kind === 'voice' ? t('chat.quotedVoice') : context.snippet,
    seedText: null,
  };
}

const EMPTY_ACTIONS: ChatMessageActions = { reply: false, edit: false, unsend: false, forward: false };

export function ChatScreenSurface({ vm }: ChatScreenSurfaceProps) {
  const { colors } = useAppTheme();
  const { top, bottomContentInset } = useScreenInsets('stackHeader');
  const { width: windowWidth } = useWindowDimensions();
  const bubbleMaxWidth = Math.round(windowWidth * BUBBLE_MAX_WIDTH_RATIO);
  const timeline = useChatTimeline(vm);
  const isEmpty = timeline.length === 0;
  const receiptMessageId = useMemo(
    () => lastOwnServerTextId(timeline, vm.currentUserId),
    [timeline, vm.currentUserId]
  );
  const listRef = useRef<FlashListRef<ChatTimelineEntry>>(null);
  const restingPad = Math.max(bottomContentInset, 10);
  const listTopInset = top + STACK_NAV_BAR_HEIGHT + 8;
  // One-line composer; a taller draft adds its overflow as a UI-thread inset (ChatListScrollView).
  const listBottomInset = COMPOSER_BASE_CONTENT_HEIGHT + restingPad + COMPOSER_EDGE_FADE_EXTRA;
  const keyboard = useAnimatedKeyboard();
  const composerHeight = useSharedValue(COMPOSER_BASE_CONTENT_HEIGHT + restingPad);
  const [scrolledUp, setScrolledUp] = useState(false);
  const keyboardSync = useChatKeyboardSync(keyboard, restingPad, !isEmpty, composerHeight, setScrolledUp);
  const newWhileScrolledUp = useNewIncomingWhileScrolledUp(timeline, vm.currentUserId, scrolledUp);
  const motionEnabled = useMotionEnabled();
  const scrollToNewest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: motionEnabled });
  }, [motionEnabled]);

  // Loading / empty placeholders stay centred in the space above the keyboard.
  const placeholderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.round(Math.max(0, keyboard.height.get())) / 2 }],
  }));

  useFollowOwnNewItems(listRef, timeline, vm.currentUserId);

  const {
    onReportMessage,
    onReactToMessage,
    onRemoveReaction,
    onCopyMessage,
    onSetSaved,
    onUploadAction,
    onRetryText,
    onDeleteOutbox,
    onCancelSending,
    onOpenNix,
    onReportNix,
    onOpenUploadActions,
    onRetryUpload,
    onReply,
    onEdit,
    onUnsend,
    onForward,
    messageActionsFor,
  } = useChatTimelineHandlers(vm);
  const onCancelContext = useStableHandler(() => vm.handleCancelComposerContext());
  const rootRef = useRef<View>(null);
  const [overlay, setOverlay] = useState<MessageOverlayRequest | null>(null);
  const onOpenOverlay = useStableHandler(({ messageId, isOwn, frame, ...request }: BubbleOverlayRequest) => {
    rootRef.current?.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
      setOverlay({
        ...request,
        target: {
          messageId,
          isOwn,
          x: frame.x - rootX,
          y: frame.y - rootY,
          width: frame.width,
          height: frame.height,
          rootWidth,
          rootHeight,
        },
      });
    });
  });
  const overlayMessage = overlay
    ? vm.messages.find((message) => message.id === overlay.target.messageId) ?? null
    : null;
  const overlayEmoji = overlay
    ? (vm.reactionsByMessageId.get(overlay.target.messageId) ?? []).find(
        (reaction) => reaction.user_id === vm.currentUserId,
      )?.emoji ?? null
    : null;
  const onSend = useStableHandler((body: string) => vm.handleSend(body));
  const onPaste = useStableHandler((payload: ChatPastePayload) => vm.handlePaste(payload));
  const onDraftChange = useStableHandler((text: string) => vm.onComposerInput(text));
  const onDraftBlur = useStableHandler(() => vm.onComposerStop());
  const onOpenCamera = useStableHandler(() => vm.handleOpenCamera());
  const onSendVoice = useStableHandler((recording: VoiceRecordingResult) => vm.handleSendVoice(recording));

  // One voice player for the chat; bubbles read their own state from its store.
  const voicePlayer = useChatVoicePlayback({
    onError: () => notifyError(vm.t('chat.voicePlayFailure')),
  });
  const onToggleVoice = useStableHandler((messageId: string) => {
    const message = vm.messages.find((candidate) => candidate.id === messageId);
    const info = message ? chatVoiceInfo(message) : null;
    if (!message || !info) return;
    void voicePlayer.toggle(messageId, {
      path: info.path,
      localUri: message.localVoiceUri ?? null,
      durationMs: info.durationMs,
    });
  });
  const { store: voiceStore, toggle: voiceToggle, pause: pauseVoice } = voicePlayer;
  const voicePlaybackContext = useMemo<ChatVoicePlayback>(
    () => ({
      store: voiceStore,
      toggle: (messageId, source) => void voiceToggle(messageId, source),
    }),
    [voiceStore, voiceToggle],
  );

  const {
    t,
    locale,
    currentUserId,
    canPerformNetworkAction,
    canCopyMessages,
    canSaveMessages,
    reactionsByMessageId,
    nixReactionsById,
    busyUploadActions,
  } = vm;
  const peerName = chatPeerName(vm);
  const youLabel = t('chat.a11yYou');
  const { highlightedNixId, nixesById, onShowRepliedNix } = useRepliedNixJump(
    vm.nixes,
    timeline,
    listRef,
    motionEnabled
  );
  const { highlightedMessageId, loadedMessageIds, onShowQuotedMessage } = useQuotedMessageJump(
    timeline,
    listRef,
    motionEnabled
  );
  const composerContext = composerContextView(vm.composerContext, t, peerName);
  // The reply / edit banner makes the composer taller: keep the newest message above it.
  const composerContextKey = composerContext?.key ?? null;
  useEffect(() => {
    if (!composerContextKey || scrolledUp) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: motionEnabled }));
    return () => cancelAnimationFrame(frame);
  }, [composerContextKey, motionEnabled, scrolledUp]);

  const renderTimelineItem = useCallback(({ item }: { item: ChatTimelineEntry }) => {
    if (item.type === 'separator') {
      return <DateSeparator label={item.label} />;
    }
    if (item.type === 'nix') {
      return (
        <NixChip
          nix={item.nix}
          reaction={nixReactionsById[item.nix.id]?.emoji ?? null}
          maxWidth={bubbleMaxWidth}
          highlighted={highlightedNixId === item.nix.id}
          t={t}
          onOpen={onOpenNix}
          onReport={onReportNix}
        />
      );
    }
    if (item.type === 'media' && item.nix) {
      // Delivered: the upload bubble becomes a regular NiX chip (icon + Snapchat-style status).
      return (
        <NixChip
          nix={item.nix}
          reaction={nixReactionsById[item.nix.id]?.emoji ?? null}
          maxWidth={bubbleMaxWidth}
          highlighted={highlightedNixId === item.nix.id}
          t={t}
          onOpen={onOpenNix}
          onReport={onReportNix}
        />
      );
    }
    if (item.type === 'media') {
      return (
        <OutgoingMediaBubble
          jobId={item.jobId}
          job={item.job}
          nix={item.nix}
          busyAction={busyUploadActions.get(item.jobId) ?? null}
          maxWidth={bubbleMaxWidth}
          t={t}
          onOpenActions={onOpenUploadActions}
          onRetry={onRetryUpload}
          onAction={onUploadAction}
        />
      );
    }
    const message = item.message;
    if (message.is_system) {
      return <SystemMessageItem message={message} />;
    }
    const isOwn = message.sender_id === currentUserId;
    const outboxStatus = message.outboxStatus ?? null;
    const canReact = canPerformNetworkAction && outboxStatus === null;
    const receipt = message.id === receiptMessageId ? outgoingTextStatus(message) : null;
    const voice = chatVoiceInfo(message);
    const reply = chatNixReplyContext(message, currentUserId, nixesById);
    const quote = chatMessageReplyContext(message, currentUserId);
    return (
      <MessageBubble
        messageId={message.id}
        body={message.body}
        createdAt={message.created_at}
        locale={locale}
        isOwn={isOwn}
        senderName={isOwn ? youLabel : peerName}
        peerName={peerName}
        isOptimistic={outboxStatus !== null}
        outboxStatus={outboxStatus}
        outboxId={message.outboxId ?? null}
        receipt={receipt}
        maxWidth={bubbleMaxWidth}
        reactions={reactionsByMessageId.get(message.id) ?? EMPTY_REACTIONS}
        currentUserId={currentUserId}
        canReact={canReact}
        canCopy={canCopyMessages}
        group={item.group}
        savedBy={chatSavedState(message, currentUserId).savedBy}
        canSave={canSaveMessages && outboxStatus === null}
        voiceDurationMs={voice ? voice.durationMs : null}
        voiceWaveform={message.voice_waveform ?? null}
        replyToNixId={reply?.nixId ?? null}
        replyToNixKind={reply?.kind ?? 'photo'}
        replyToNixInTimeline={reply?.inTimeline ?? false}
        quoteAuthor={quote ? (quote.author === 'me' ? t('chat.quoteAuthorYou') : peerName) : null}
        quoteSnippet={quote?.snippet ?? ''}
        quoteIsVoice={quote?.kind === 'voice'}
        quoteMessageId={quote?.messageId ?? null}
        quoteInTimeline={quote ? loadedMessageIds.has(quote.messageId) : false}
        edited={Boolean(message.edited_at)}
        highlighted={highlightedMessageId === message.id}
        actions={outboxStatus === 'expired' ? EMPTY_ACTIONS : messageActionsFor(message)}
        onReact={onReactToMessage}
        onRemoveReaction={onRemoveReaction}
        onOpenOverlay={onOpenOverlay}
        onCopy={onCopyMessage}
        onReport={onReportMessage}
        onRetry={onRetryText}
        onDeleteOutbox={onDeleteOutbox}
        onCancelSending={onCancelSending}
        onSetSaved={onSetSaved}
        onToggleVoice={onToggleVoice}
        onShowRepliedNix={onShowRepliedNix}
        onReply={onReply}
        onEdit={onEdit}
        onUnsend={onUnsend}
        onForward={onForward}
        onShowQuotedMessage={onShowQuotedMessage}
      />
    );
  }, [
    bubbleMaxWidth,
    busyUploadActions,
    canCopyMessages,
    canPerformNetworkAction,
    canSaveMessages,
    currentUserId,
    highlightedMessageId,
    highlightedNixId,
    loadedMessageIds,
    locale,
    messageActionsFor,
    onEdit,
    onForward,
    onReply,
    onShowQuotedMessage,
    onUnsend,
    nixesById,
    onCancelSending,
    onCopyMessage,
    onDeleteOutbox,
    onOpenNix,
    onOpenOverlay,
    onOpenUploadActions,
    onReportNix,
    onReactToMessage,
    onRemoveReaction,
    onReportMessage,
    onRetryText,
    onRetryUpload,
    onSetSaved,
    onShowRepliedNix,
    onToggleVoice,
    onUploadAction,
    peerName,
    nixReactionsById,
    reactionsByMessageId,
    receiptMessageId,
    t,
    youLabel,
  ]);

  return (
    <ChatVoicePlaybackContext value={voicePlaybackContext}>
    <View ref={rootRef} collapsable={false} style={[styles.root, { backgroundColor: colors.systemBackground }]}>
      <View style={styles.listArea}>
        {isEmpty ? (
          <Animated.View style={[styles.listArea, placeholderStyle]}>
            <ChatListPlaceholder vm={vm} />
          </Animated.View>
        ) : (
          <ChatListKeyboardContext value={keyboardSync.binding}>
            <FlashList
              ref={listRef}
              data={timeline}
              keyExtractor={timelineKeyExtractor}
              getItemType={timelineItemType}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
              renderScrollComponent={ChatListScrollView}
              // Manual top/bottom padding compensates for headerTransparent + the resting composer;
              // the keyboard lift is a UI-thread `contentInset.bottom` (ChatListScrollView).
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={[
                styles.listContent,
                { paddingTop: listTopInset, paddingBottom: listBottomInset },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              scrollEventThrottle={16}
              onScrollBeginDrag={keyboardSync.onScrollBeginDrag}
              onScrollEndDrag={keyboardSync.onScrollEndDrag}
              onMomentumScrollBegin={keyboardSync.onMomentumScrollBegin}
              onMomentumScrollEnd={keyboardSync.onMomentumScrollEnd}
              onContentSizeChange={keyboardSync.onContentSizeChange}
              onLayout={keyboardSync.onLayout}
              onStartReached={vm.onReachedOldestMessage}
              onStartReachedThreshold={0.25}
              ListHeaderComponent={
                <ChatHistoryHeader
                  loading={vm.loadingOlderMessages}
                  // Start of the stored history: say once that messages vanish after 24 h.
                  showDisappearingHint={!vm.onReachedOldestMessage && !vm.loadingOlderMessages}
                  hint={vm.t('chat.disappearsFooter')}
                />
              }
              renderItem={renderTimelineItem}
            />
          </ChatListKeyboardContext>
        )}
        <ChatComposer
          t={vm.t}
          keyboardHeight={keyboard.height}
          restingPad={restingPad}
          pasteInputEnabled={vm.pasteInputEnabled}
          pasteImporting={vm.pasteImporting}
          onPaste={onPaste}
          onSend={onSend}
          composerHeight={composerHeight}
          onDraftChange={onDraftChange}
          onDraftBlur={onDraftBlur}
          onOpenCamera={onOpenCamera}
          voiceEnabled={vm.voiceMessagesSupported}
          voiceAvailable={vm.canRecordVoice}
          onSendVoice={onSendVoice}
          onVoiceRecordingStart={pauseVoice}
          context={composerContext}
          onCancelContext={onCancelContext}
        />
        <ScrollToBottomButton
          visible={scrolledUp && !isEmpty}
          newCount={newWhileScrolledUp}
          keyboardHeight={keyboard.height}
          restingPad={restingPad}
          composerHeight={composerHeight}
          onPress={scrollToNewest}
        />
      </View>
      {overlay && overlayMessage ? (
        <MessageOverlay
          request={overlay}
          minTop={listTopInset}
          bottomLimit={restingPad}
          selectedEmoji={overlayEmoji}
          onSelect={(emoji) => {
            // Same emoji again = take it back (handled in the view model); the overlay closes itself.
            void vm.handleSetReaction(overlayMessage, emoji);
          }}
          onDismiss={() => setOverlay(null)}
        />
      ) : null}
    </View>
    </ChatVoicePlaybackContext>
  );
}

function ChatHistoryHeader({
  loading,
  showDisappearingHint,
  hint,
}: {
  loading: boolean;
  showDisappearingHint: boolean;
  hint: string;
}) {
  const { colors } = useAppTheme();
  if (loading) {
    return (
      <View style={styles.olderLoader}>
        <ActivityIndicator color={colors.secondaryLabel} />
      </View>
    );
  }
  if (!showDisappearingHint) return null;
  return (
    <View style={styles.historyHint}>
      <AppIcon name="timer" size={APP_ICON_SIZE.xs} color={colors.secondaryLabel} />
      <Text style={[styles.historyHintText, { color: colors.secondaryLabel }]}>{hint}</Text>
    </View>
  );
}

/**
 * Counts incoming messages appended while the reader is in older history; resets as soon as they
 * are back at the newest message (scrolled or tapped the button).
 */
function useNewIncomingWhileScrolledUp(
  timeline: readonly ChatTimelineEntry[],
  currentUserId: string,
  scrolledUp: boolean
) {
  const [state, setState] = useState<{ previousIds: ReadonlySet<string>; count: number }>(() => ({
    previousIds: new Set(timeline.map((item) => item.id)),
    count: 0,
  }));
  const [trackedTimeline, setTrackedTimeline] = useState(timeline);
  const [trackedScrolledUp, setTrackedScrolledUp] = useState(scrolledUp);
  // Adjust state while rendering (no effect round trip): only when the inputs actually changed.
  if (trackedTimeline !== timeline || trackedScrolledUp !== scrolledUp) {
    const appended = scrolledUp
      ? countAppendedIncomingItems(state.previousIds, timeline, currentUserId)
      : 0;
    setTrackedTimeline(timeline);
    setTrackedScrolledUp(scrolledUp);
    setState({
      previousIds: new Set(timeline.map((item) => item.id)),
      count: scrolledUp ? state.count + appended : 0,
    });
  }
  return state.count;
}

const styles = StyleSheet.create({
  olderLoader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
    paddingTop: 4,
    paddingBottom: 8,
  },
  historyHintText: {
    ...typography.caption,
    textAlign: 'center',
    flexShrink: 1,
  },
  unavailable: {
    alignItems: 'center',
    gap: 8,
    maxWidth: 320,
  },
  scrollButtonShell: {
    position: 'absolute',
    right: 16,
    bottom: 0,
  },
  scrollButton: {
    width: SCROLL_BUTTON_SIZE,
    height: SCROLL_BUTTON_SIZE,
    borderRadius: SCROLL_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  root: {
    flex: 1,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  row: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  rowWithReactions: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  bubbleAnchor: {
    flexGrow: 0,
    flexShrink: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 3,
    paddingRight: 4,
  },
  receiptText: {
    ...typography.caption,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    paddingHorizontal: 4,
  },
  savedRowOwn: {
    alignSelf: 'flex-end',
  },
  savedRowIncoming: {
    alignSelf: 'flex-start',
  },
  savedText: {
    ...typography.caption,
    flexShrink: 1,
  },
  chipLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipTextColumn: {
    flexShrink: 1,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
  },
  bubblePressable: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bubbleWithReactions: {
    position: 'relative',
  },
  bubbleWithReactionsActive: {
    paddingTop: REACTION_BADGE_OVERHANG,
  },
  bubble: {
    borderRadius: BUBBLE_CORNER_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    ...typography.body,
    textAlign: 'left',
  },
  listMarker: {
    flex: 1,
  },
  reactionBadges: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    gap: 2,
    zIndex: 1,
  },
  nixHighlightRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderRadius: BUBBLE_CORNER_RADIUS + 4,
    borderCurve: 'continuous',
  },
  nixReactionBadge: {
    position: 'absolute',
    top: -10,
  },
  reactionBadgesOwn: {
    left: -REACTION_BADGE_CORNER_OUTSET,
  },
  reactionBadgesIncoming: {
    right: -REACTION_BADGE_CORNER_OUTSET,
  },
  reactionBadge: {
    minWidth: REACTION_BADGE_SIZE,
    height: REACTION_BADGE_SIZE,
    borderRadius: REACTION_BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  reactionBadgeGlyph: {
    fontSize: 14,
    lineHeight: 18,
  },
  chipTitle: {
    ...typography.footnote,
    fontWeight: '600',
    textAlign: 'left',
  },
  chipStatus: {
    ...typography.caption,
    textAlign: 'left',
    marginTop: 2,
  },
  uploadBubble: {
    minWidth: 214,
  },
  uploadBubblePressed: {
    opacity: 0.72,
  },
  uploadContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadHeading: {
    flex: 1,
    minWidth: 0,
  },
  uploadAccessory: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadRetryPressed: {
    opacity: 0.5,
    transform: [{ scale: 0.94 }],
  },
  sendingSpinnerSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendingSpinnerOwn: {
    left: -30,
  },
  sendingSpinnerIncoming: {
    right: -30,
  },
  outboxStatusText: {
    ...typography.caption,
    marginTop: 4,
    opacity: 0.82,
  },
  expiredText: {
    ...typography.footnote,
    fontStyle: 'italic',
  },
  separatorRow: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  separatorText: {
    ...typography.caption,
    textAlign: 'center',
  },
  systemMessageText: {
    ...typography.footnote,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  muted: {
    ...typography.footnote,
  },
  emptyTitle: {
    ...typography.headline,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  composerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  composerEdgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -COMPOSER_EDGE_FADE_EXTRA,
    bottom: 0,
  },
  composerContextRow: {
    // Lines up with the input pill, past the camera button.
    marginLeft: COMPOSER_CONTROL_SIZE + 8,
    marginRight: COMPOSER_CONTROL_SIZE + 8,
  },
  composerRow: {
    flexDirection: 'row',
    // Buttons stay on the last line while the draft grows upwards (iMessage).
    alignItems: 'flex-end',
    gap: 8,
  },
  inputGlass: {
    flex: 1,
    minHeight: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    justifyContent: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  pasteInputWrapper: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  inputText: {
    ...typography.body,
    margin: 0,
    paddingHorizontal: 0,
    paddingTop: COMPOSER_INPUT_VERTICAL_PAD,
    paddingBottom: COMPOSER_INPUT_VERTICAL_PAD,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 4 + COMPOSER_CONTROL_SIZE + 8,
    paddingTop: 4,
  },
  footerCounter: {
    ...typography.caption,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});

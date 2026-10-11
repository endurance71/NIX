import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import type { useFriendDetailScreen } from '../../hooks/useFriendDetailScreen';
import { CHAT_PEER_REPORT_REASONS } from '../chat/ChatHeaderMenu';
import { NativeSettingsRow, NativeSettingsSection } from '../ui/native-settings';

type FriendDetailVm = ReturnType<typeof useFriendDetailScreen>;

export function FriendQuickActionsSection({ vm }: { vm: FriendDetailVm }) {
  return (
    <NativeSettingsSection>
      <NativeSettingsRow
        title={vm.t('friends.sendNix')}
        icon="camera"
        showsChevron
        onPress={vm.handleSendNix}
        testID="friend-detail-send-nix"
      />
      <NativeSettingsRow
        title={vm.t('friends.message')}
        icon="message"
        showsChevron
        onPress={vm.handleMessage}
        testID="friend-detail-message"
      />
    </NativeSettingsSection>
  );
}

function requestMute(vm: FriendDetailVm) {
  if (vm.isMuted) {
    void vm.handleSetMute('off');
    return;
  }
  Alert.alert(vm.t('chat.muteTitle'), undefined, [
    { text: vm.t('chat.mute1h'), onPress: () => void vm.handleSetMute('1h') },
    { text: vm.t('chat.mute24h'), onPress: () => void vm.handleSetMute('24h') },
    { text: vm.t('chat.muteForever'), onPress: () => void vm.handleSetMute('forever') },
    { text: vm.t('common.cancel'), style: 'cancel' },
  ]);
}

function muteSupportingText(vm: FriendDetailVm): string | undefined {
  if (!vm.isMuted) return undefined;
  return vm.mutedUntilLabel
    ? vm.t('friends.mutedUntil', { time: vm.mutedUntilLabel })
    : vm.t('friends.mutedIndefinitely');
}

/** Screenshot permission as a labelled native toggle (visible but disabled offline) and mute. */
export function FriendPreferencesSection({ vm }: { vm: FriendDetailVm }) {
  const offline = !vm.canPerformNetworkAction;
  const captureKnown = vm.capturePolicy !== undefined;
  return (
    <NativeSettingsSection footer={vm.t('profile.screenshotPermissionHint')}>
      {/* Keyed by state: the row turns from static into a toggle once the policy loads, and the
          RN SymbolView icon did not survive that SwiftUI re-parenting (the row lost its icon). */}
      <NativeSettingsRow
        key={captureKnown ? 'capture-toggle' : 'capture-loading'}
        title={vm.t('profile.screenshotPermission')}
        icon="saveToPhotos"
        switchValue={captureKnown ? vm.capturePolicy === 'allow' : undefined}
        onSwitchValueChange={offline ? undefined : (allowed) => void vm.handleToggleCapture(allowed)}
        disabled={vm.busy.has('capture')}
        testID="friend-detail-capture"
      />
      {vm.muteAvailable ? (
        <NativeSettingsRow
          title={vm.isMuted ? vm.t('chat.unmute') : vm.t('chat.mute')}
          supportingText={muteSupportingText(vm)}
          icon={vm.isMuted ? 'notification' : 'notificationOff'}
          disabled={offline || vm.busy.has('mute')}
          onPress={() => requestMute(vm)}
          testID="friend-detail-mute"
        />
      ) : null}
    </NativeSettingsSection>
  );
}

function confirmRemove(vm: FriendDetailVm, username: string) {
  Alert.alert(
    vm.t('profile.removeFriendConfirmTitle', { username }),
    vm.t('profile.removeFriendConfirmMessage'),
    [
      { text: vm.t('common.cancel'), style: 'cancel' },
      { text: vm.t('profile.removeFriend'), style: 'destructive', onPress: () => void vm.handleRemove() },
    ],
  );
}

function confirmBlock(vm: FriendDetailVm, username: string) {
  Alert.alert(vm.t('friends.blockConfirmTitle', { username }), vm.t('viewer.blockConfirmMessage'), [
    { text: vm.t('common.cancel'), style: 'cancel' },
    { text: vm.t('chat.block'), style: 'destructive', onPress: () => void vm.handleBlock() },
  ]);
}

function chooseReportReason(vm: FriendDetailVm, t: TFunction) {
  Alert.alert(
    t('inbox.reportPersonTitle'),
    undefined,
    [
      ...CHAT_PEER_REPORT_REASONS.map((reason) => ({
        text: t(`profile.reportReason.${reason}`),
        onPress: () => void vm.handleReport(reason),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}

/** Report, Block and Remove — each confirmed, all disabled offline. */
export function FriendSafetySection({ vm, username }: { vm: FriendDetailVm; username: string }) {
  const offline = !vm.canPerformNetworkAction;
  return (
    <NativeSettingsSection>
      <NativeSettingsRow
        title={vm.t('chat.report')}
        icon="report"
        disabled={offline || vm.busy.has('report')}
        onPress={() => chooseReportReason(vm, vm.t)}
        testID="friend-detail-report"
      />
      <NativeSettingsRow
        title={vm.t('chat.block')}
        icon="block"
        role="destructive"
        disabled={offline || vm.busy.has('block')}
        onPress={() => confirmBlock(vm, username)}
        testID="friend-detail-block"
      />
      <NativeSettingsRow
        title={vm.t('profile.removeFriend')}
        icon="personRemove"
        role="destructive"
        disabled={offline || vm.busy.has('remove')}
        onPress={() => confirmRemove(vm, username)}
        testID="friend-detail-remove"
      />
    </NativeSettingsSection>
  );
}

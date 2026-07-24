import { ActionSheetIOS, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Button,
  ContentUnavailableView,
  HStack,
  List,
  ProgressView,
  Text,
  TextInput,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  onTapGesture,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { ChatScreenViewModel, OptimisticTextMessage } from '../../hooks/useChatScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from '../ui/app-host';

type ChatScreenSurfaceProps = {
  vm: ChatScreenViewModel;
};

const supportsContentUnavailableView =
  Platform.OS === 'ios' && Number.parseFloat(String(Platform.Version)) >= 17;

function formatCountdown(expiresAtStr: string): string {
  const expiresAt = new Date(expiresAtStr).getTime();
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return '0m';
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function MessageBubble({
  message,
  isOwn,
  vm,
}: {
  message: OptimisticTextMessage;
  isOwn: boolean;
  vm: ChatScreenViewModel;
}) {
  const { colors } = useAppTheme();
  const countdown = formatCountdown(message.expires_at);

  const handlePressMessage = () => {
    if (isOwn) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [vm.t('common.cancel'), vm.t('chat.reportMessage')],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            void vm.handleReportMessage(message);
          }
        }
      );
    } else {
      Alert.alert(vm.t('chat.reportMessage'), undefined, [
        { text: vm.t('common.cancel'), style: 'cancel' },
        { text: vm.t('chat.reportMessage'), style: 'destructive', onPress: () => void vm.handleReportMessage(message) },
      ]);
    }
  };

  return (
    <HStack
      alignment="top"
      modifiers={[
        frame({ maxWidth: Infinity, alignment: isOwn ? 'trailing' : 'leading' }),
        listRowInsets({ top: 4, leading: 12, bottom: 4, trailing: 12 }),
        listRowBackground(colors.systemBackground),
        listRowSeparator('hidden'),
        onTapGesture(handlePressMessage),
      ]}>
      <VStack
        alignment={isOwn ? 'trailing' : 'leading'}
        spacing={4}
        modifiers={[
          frame({ maxWidth: 280, alignment: isOwn ? 'trailing' : 'leading' }),
          padding({ top: 8, leading: 12, bottom: 8, trailing: 12 }),
          foregroundStyle(isOwn ? '#FFFFFF' : colors.label),
        ]}>
        <Text
          modifiers={[
            font({ textStyle: 'body' }),
            foregroundStyle(isOwn ? '#FFFFFF' : colors.label),
          ]}>
          {message.body}
        </Text>
        <HStack alignment="center" spacing={4}>
          <Text
            modifiers={[
              font({ textStyle: 'caption2' }),
              foregroundStyle(isOwn ? 'rgba(255, 255, 255, 0.75)' : colors.textMuted),
            ]}>
            {vm.t('chat.disappearsIn', { time: countdown })}
          </Text>
          {message.isSending && (
            <ProgressView modifiers={[controlSize('mini')]} />
          )}
        </HStack>
      </VStack>
    </HStack>
  );
}

export function ChatScreenSurface({ vm }: ChatScreenSurfaceProps) {
  const { colors } = useAppTheme();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}>
      <AppHost style={{ flex: 1, backgroundColor: colors.background }}>
        {vm.messagesLoading ? (
          <VStack alignment="center" spacing={12} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
            <ProgressView />
            <Text modifiers={[foregroundStyle(colors.textMuted)]}>{vm.t('common.loading')}</Text>
          </VStack>
        ) : vm.messages.length === 0 ? (
          <VStack alignment="center" spacing={12} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), padding({ top: 40 })]}>
            {supportsContentUnavailableView ? (
              <ContentUnavailableView
                title={vm.t('chat.emptyChat')}
                systemImage="bubble.left.and.bubble.right"
              />
            ) : (
              <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.textMuted)]}>
                {vm.t('chat.emptyChat')}
              </Text>
            )}
          </VStack>
        ) : (
          <List style={{ flex: 1 }}>
            {vm.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender_id === vm.currentUserId}
                vm={vm}
              />
            ))}
          </List>
        )}

        {/* Composer Section */}
        <VStack
          spacing={6}
          modifiers={[
            padding({ top: 8, leading: 12, bottom: 12, trailing: 12 }),
            frame({ maxWidth: Infinity }),
          ]}>
          <HStack alignment="center" spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <TextInput
              defaultValue={vm.inputBody}
              placeholder={vm.t('chat.typeMessage')}
              onChangeText={vm.setInputBody}
              onSubmitEditing={() => void vm.handleSend()}
              editable={!vm.sending}
              modifiers={[
                frame({ maxWidth: Infinity, minHeight: 38 }),
              ]}
            />
            <Button
              title={vm.t('chat.send')}
              onPress={() => void vm.handleSend()}
              disabled={!vm.inputBody.trim() || vm.sending}
              modifiers={[
                buttonStyle('borderedProminent'),
                buttonBorderShape('capsule'),
                controlSize('regular'),
                tint(colors.accent),
              ]}
            />
          </HStack>
          <HStack alignment="center" spacing={4} modifiers={[frame({ maxWidth: Infinity })]}>
            <Text
              modifiers={[
                font({ textStyle: 'caption2' }),
                foregroundStyle(colors.textMuted),
                frame({ maxWidth: Infinity, alignment: 'leading' }),
              ]}>
              {vm.t('chat.disappearsFooter')}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: 'caption2' }),
                foregroundStyle(colors.textMuted),
              ]}>
              {`${vm.inputBody.length}/2000`}
            </Text>
          </HStack>
        </VStack>
      </AppHost>
    </KeyboardAvoidingView>
  );
}

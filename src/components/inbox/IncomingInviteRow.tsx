import { View } from 'react-native';
import { Button, HStack, ProgressView, RNHostView, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  layoutPriority,
  lineLimit,
  tint,
  type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers';
import type { TFunction } from 'i18next';
import type { IncomingFriendRequest } from '../../services/friendService';
import { useAppTheme } from '../../hooks/useAppTheme';
import { resolveAppIconName } from '../../theme/app-icons';
import { AvatarCircle } from '../ui/avatar-circle';

const DEFAULT_AVATAR_SIZE = 44;

/**
 * An incoming friend invite as a plain row (no wrapping row button): the name block is one
 * VoiceOver element and both actions are visible, separately focusable buttons — Decline (xmark)
 * and Accept. Shared by the inbox list and the Friends screen.
 */
export function IncomingInviteRow({
  request,
  avatarUrl,
  busy,
  enabled,
  description,
  onAccept,
  onReject,
  t,
  avatarSize = DEFAULT_AVATAR_SIZE,
  modifiers = [],
}: {
  request: IncomingFriendRequest;
  avatarUrl: string | null;
  busy: boolean;
  enabled: boolean;
  description: string;
  onAccept: () => void;
  onReject: () => void;
  t: TFunction;
  avatarSize?: number;
  modifiers?: ModifierConfig[];
}) {
  const { colors } = useAppTheme();
  const requester = request.requester;
  const name = requester.display_name || `@${requester.username}`;

  return (
    <HStack
      alignment="center"
      spacing={12}
      modifiers={[frame({ maxWidth: Infinity, minHeight: 44, alignment: 'leading' }), ...modifiers]}>
      <RNHostView matchContents>
        <View
          collapsable={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: avatarSize, height: avatarSize }}>
          <AvatarCircle
            size={avatarSize}
            url={avatarUrl}
            storagePath={requester.avatar_storage_path ?? null}
            emoji={requester.avatar_emoji ?? null}
            fallbackInitial={requester.username}
          />
        </View>
      </RNHostView>
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          layoutPriority(1),
          accessibilityElement('ignore'),
          accessibilityLabel(`${name}, ${description}`),
        ]}>
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'body', weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            lineLimit(1),
          ]}>
          {name}
        </Text>
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'subheadline' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(2),
          ]}>
          {description}
        </Text>
      </VStack>
      {busy ? (
        <ProgressView modifiers={[accessibilityLabel(t('common.loading'))]} />
      ) : (
        <HStack alignment="center" spacing={8} modifiers={[fixedSize()]}>
          <Button
            label={t('inbox.reject')}
            systemImage={resolveAppIconName('close')}
            onPress={onReject}
            modifiers={[
              labelStyle('iconOnly'),
              buttonStyle('bordered'),
              buttonBorderShape('circle'),
              controlSize('small'),
              tint(colors.secondaryLabel),
              disabledModifier(!enabled),
              accessibilityLabel(`${t('inbox.reject')}, ${name}`),
            ]}
          />
          <Button
            label={t('inbox.accept')}
            onPress={onAccept}
            modifiers={[
              buttonStyle('borderedProminent'),
              buttonBorderShape('capsule'),
              controlSize('small'),
              tint(colors.accent),
              disabledModifier(!enabled),
              accessibilityLabel(`${t('inbox.accept')}, ${name}`),
            ]}
          />
        </HStack>
      )}
    </HStack>
  );
}

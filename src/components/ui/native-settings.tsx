import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, FieldGroup, ListItem, RNHostView, Switch, Text } from '@expo/ui';
import { Button as SwiftUIButton, HStack, SwipeActions, VStack } from '@expo/ui/swift-ui';
import { SymbolView } from 'expo-symbols';
import {
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  multilineTextAlignment,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useAppTheme } from '../../hooks/useAppTheme';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { AvatarCircle } from './avatar-circle';

type NativeSettingsSectionProps = {
  title?: string;
  children: ReactNode;
};

export function NativeSettingsSection({ title, children }: NativeSettingsSectionProps) {
  return <FieldGroup.Section title={title}>{children}</FieldGroup.Section>;
}

type NativeSettingsRowProps = {
  title: string;
  supportingText?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  icon?: AppIconName;
  iconColor?: string;
  avatar?: {
    url?: string | null;
    storagePath?: string | null;
    emoji?: string | null;
    fallbackInitial?: string | null;
    size?: number;
  };
  role?: 'default' | 'destructive';
  disabled?: boolean;
  showsChevron?: boolean;
  switchValue?: boolean;
  onSwitchValueChange?: (value: boolean) => void;
  testID?: string;
};

export function NativeSettingsRow({
  title,
  supportingText,
  leading,
  trailing,
  onPress,
  icon,
  iconColor,
  avatar,
  role = 'default',
  disabled = false,
  showsChevron = false,
  switchValue,
  onSwitchValueChange,
  testID,
}: NativeSettingsRowProps) {
  const { colors } = useAppTheme();
  const avatarSize = avatar?.size ?? 36;
  const foregroundColor = disabled
    ? colors.tertiaryLabel
    : role === 'destructive'
      ? colors.destructive
      : colors.label;
  const resolvedLeading = avatar ? (
    <RNHostView matchContents>
      <View collapsable={false} style={{ width: avatarSize, height: avatarSize }}>
        <AvatarCircle
          size={avatarSize}
          url={avatar.url}
          storagePath={avatar.storagePath}
          emoji={avatar.emoji}
          fallbackInitial={avatar.fallbackInitial}
        />
      </View>
    </RNHostView>
  ) : icon ? (
    <HStack alignment="center" modifiers={[frame({ width: 26, alignment: 'center' })]}>
      <SymbolView name={resolveAppIconName(icon) as SFSymbol} size={19} tintColor={iconColor ?? foregroundColor} fallback={<View style={{ width: 19, height: 19 }} />} />
    </HStack>
  ) : (
    leading
  );
  const resolvedTrailing =
    typeof switchValue === 'boolean' && onSwitchValueChange ? (
      <Switch
        value={switchValue}
        onValueChange={onSwitchValueChange}
        disabled={disabled}
        testID={testID ? `${testID}-switch` : undefined}
      />
    ) : showsChevron ? (
      <SymbolView name="chevron.right" size={13} tintColor={colors.tertiaryLabel} fallback={<View style={{ width: 13, height: 13 }} />} />
    ) : (
      trailing
    );

  return (
    <ListItem
      leading={resolvedLeading}
      trailing={resolvedTrailing}
      supportingText={supportingText}
      onPress={disabled ? undefined : onPress}
      testID={testID}>
      <Text textStyle={{ color: foregroundColor }}>{title}</Text>
    </ListItem>
  );
}

export function NativeSettingsSwipeActions({
  children,
  actionLabel,
  onAction,
  destructive = true,
  allowsFullSwipe = false,
  disabled = false,
}: {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
  destructive?: boolean;
  allowsFullSwipe?: boolean;
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;

  return (
    <SwipeActions>
      {children}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe={allowsFullSwipe}>
        <SwiftUIButton
          label={actionLabel}
          role={destructive ? 'destructive' : 'default'}
          onPress={onAction}
        />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

export function NativeSettingsActionRow({
  title,
  destructive,
  disabled,
  onPress,
}: {
  title: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      label={title}
      variant={destructive ? 'outlined' : 'filled'}
      onPress={onPress}
      disabled={disabled}
    />
  );
}

export function NativeSettingsEmptyRow({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ fontSize: 15, color: colors.secondaryLabel, lineHeight: 20 }}>
      {text}
    </Text>
  );
}

export function NativeSettingsCenteredFooter({ lines }: { lines: string[] }) {
  const { colors } = useAppTheme();
  return (
    <VStack
      alignment="center"
      spacing={2}
      modifiers={[
        listRowBackground('transparent'),
        listRowSeparator('hidden'),
        listRowInsets({ top: 10, leading: 0, bottom: 2, trailing: 0 }),
        frame({ maxWidth: Infinity, alignment: 'center' }),
      ]}>
      {lines.map((line) => (
        <Text
          key={line}
          modifiers={[
            font({ textStyle: 'footnote' }),
            foregroundStyle(colors.secondaryLabel),
            multilineTextAlignment('center'),
            frame({ maxWidth: Infinity, alignment: 'center' }),
          ]}>
          {line}
        </Text>
      ))}
    </VStack>
  );
}

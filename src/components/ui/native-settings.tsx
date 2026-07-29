import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FieldGroup, ListItem, RNHostView, Switch, Text } from '@expo/ui';
import { Button as SwiftUIButton, HStack, Image as SwiftImage, SwipeActions, VStack } from '@expo/ui/swift-ui';
import { SymbolView } from 'expo-symbols';
import {
  buttonStyle,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  multilineTextAlignment,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  APP_ICON_SIZE,
  resolveAppIconName,
  resolveSettingsIconMetrics,
  type AppIconName,
} from '../../theme/app-icons';
import { AvatarCircle } from './avatar-circle';

type NativeSettingsSectionProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

export function NativeSettingsSection({ title, footer, children }: NativeSettingsSectionProps) {
  const { colors } = useAppTheme();

  return (
    <FieldGroup.Section title={title}>
      {children}
      {footer ? (
        <FieldGroup.SectionFooter>
          <Text
            modifiers={[
              font({ textStyle: 'footnote' }),
              foregroundStyle(colors.secondaryLabel),
              lineLimit(2),
            ]}>
            {footer}
          </Text>
        </FieldGroup.SectionFooter>
      ) : null}
    </FieldGroup.Section>
  );
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
  const resolvedIconColor = disabled
    ? colors.tertiaryLabel
    : role === 'destructive'
      ? colors.destructive
      : (iconColor ?? colors.accent);
  const iconMetrics = icon ? resolveSettingsIconMetrics(icon) : null;
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
      <SymbolView
        name={resolveAppIconName(icon) as SFSymbol}
        size={iconMetrics?.size ?? APP_ICON_SIZE.settings}
        weight={iconMetrics?.weight ?? 'regular'}
        tintColor={resolvedIconColor}
        fallback={
          <View
            style={{
              width: iconMetrics?.size ?? APP_ICON_SIZE.settings,
              height: iconMetrics?.size ?? APP_ICON_SIZE.settings,
            }}
          />
        }
      />
    </HStack>
  ) : (
    leading
  );
  // Always SwiftImage for disclosure — SymbolView inside / beside SwiftUI accessories
  // diverges in weight/tint from plain trailing chevrons.
  const chevron = showsChevron ? (
    <SwiftImage
      systemName={resolveAppIconName('chevronRight') as SFSymbol}
      size={APP_ICON_SIZE.xs}
      color={colors.tertiaryLabel}
    />
  ) : null;

  const resolvedTrailing =
    typeof switchValue === 'boolean' && onSwitchValueChange ? (
      <Switch
        value={switchValue}
        onValueChange={onSwitchValueChange}
        disabled={disabled}
        modifiers={[tint(colors.accent)]}
        testID={testID ? `${testID}-switch` : undefined}
      />
    ) : trailing && chevron ? (
      <HStack alignment="center" spacing={8}>
        {trailing}
        {chevron}
      </HStack>
    ) : (
      trailing ?? chevron
    );
  const resolvedSupportingText = supportingText ? (
    <Text
      modifiers={[
        font({ textStyle: 'footnote' }),
        foregroundStyle(colors.secondaryLabel),
        lineLimit(2),
      ]}>
      {supportingText}
    </Text>
  ) : undefined;

  return (
    <ListItem
      leading={resolvedLeading}
      trailing={resolvedTrailing}
      supportingText={resolvedSupportingText}
      onPress={disabled ? undefined : onPress}
      testID={testID}>
      <Text
        modifiers={[
          font({ textStyle: 'body' }),
          foregroundStyle(foregroundColor),
          lineLimit(2),
        ]}>
        {title}
      </Text>
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
    <SwiftUIButton
      label={title}
      role={destructive ? 'destructive' : 'default'}
      onPress={onPress}
      modifiers={[
        buttonStyle(destructive ? 'bordered' : 'borderedProminent'),
        swiftDisabled(Boolean(disabled)),
      ]}
    />
  );
}

export function NativeSettingsEmptyRow({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <Text
      modifiers={[
        font({ textStyle: 'footnote' }),
        foregroundStyle(colors.secondaryLabel),
      ]}>
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

import type { ReactElement, ReactNode } from 'react';
import { Button, FieldGroup, ListItem, Switch, Text } from '@expo/ui';
import { AppRnHostView } from './app-rn-host-view';
import { useAppTheme } from '../../hooks/useAppTheme';

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
};

export function NativeSettingsRow({
  title,
  supportingText,
  leading,
  trailing,
  onPress,
}: NativeSettingsRowProps) {
  return (
    <ListItem
      leading={leading}
      trailing={trailing}
      supportingText={supportingText}
      onPress={onPress}>
      {title}
    </ListItem>
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

export function NativeSettingsSwitchRow({
  title,
  value,
  disabled,
  onValueChange,
}: {
  title: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return <Switch label={title} value={value} onValueChange={onValueChange} disabled={disabled} />;
}

export function NativeSettingsEmptyRow({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ fontSize: 15, color: colors.secondaryLabel, lineHeight: 20 }}>
      {text}
    </Text>
  );
}

export function NativeMediaBlock({ children }: { children: ReactElement }) {
  return <AppRnHostView matchContents>{children}</AppRnHostView>;
}

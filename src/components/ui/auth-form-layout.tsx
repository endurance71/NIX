import { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, FieldGroup, Text, TextInput } from '@expo/ui';
import type { ComponentProps } from 'react';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';

export function AuthFormLayout({ children }: PropsWithChildren) {
  const { statusBarStyle } = useAppTheme();

  return (
    <AppHost useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <FieldGroup style={styles.form}>{children}</FieldGroup>
    </AppHost>
  );
}

export function AuthFormSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return <FieldGroup.Section title={title}>{children}</FieldGroup.Section>;
}

export function AuthSecondaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>{children}</Text>
  );
}

export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ fontSize: 12, color: colors.tertiaryLabel, lineHeight: 16 }}>{children}</Text>
  );
}

export function AuthErrorText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return <Text textStyle={{ fontSize: 13, color: colors.error, lineHeight: 18 }}>{children}</Text>;
}

export function AuthTextField(props: Omit<ComponentProps<typeof TextInput>, 'value'> & { onChangeText: (text: string) => void }) {
  return <TextInput autoCapitalize="none" autoCorrect={false} {...props} />;
}

export function AuthSecureField(props: Omit<ComponentProps<typeof TextInput>, 'value'> & { onChangeText: (text: string) => void }) {
  return <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} {...props} />;
}

export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Button label={label} onPress={disabled ? undefined : onPress} variant="filled" />;
}

export function AuthSecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} onPress={onPress} variant="text" />;
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
});

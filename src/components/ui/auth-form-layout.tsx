import { PropsWithChildren } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, FieldGroup, Text, TextInput } from '@expo/ui';
import type { ComponentProps } from 'react';
import type { UniversalStyle } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { APP_FONT_FAMILY } from '../../theme/typography';

// AuthFormLayout uses full-screen FieldGroup (register, forgot-password, onboarding).
// Embedded forms (login card) must use FieldGroup.Section inside AppHost matchContents only —
// never nest FieldGroup inside ScrollView or give it a fixed height (Android LazyColumn scrolls).

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

export function AuthTextField({
  value,
  onChangeText,
  ...rest
}: Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> & {
  value?: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      {...rest}
      onChangeText={onChangeText}
      {...(value !== undefined
        ? { value: value as unknown as ComponentProps<typeof TextInput>['value'] }
        : {})}
    />
  );
}

export function AuthSecureField({
  value,
  onChangeText,
  ...rest
}: Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> & {
  value?: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <TextInput
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      {...rest}
      onChangeText={onChangeText}
      {...(value !== undefined
        ? { value: value as unknown as ComponentProps<typeof TextInput>['value'] }
        : {})}
    />
  );
}

export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: UniversalStyle;
}) {
  return (
    <Button
      label={label}
      onPress={disabled ? undefined : onPress}
      variant="filled"
      style={style}
    />
  );
}

export function AuthOutlinedButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: UniversalStyle;
}) {
  return (
    <Button
      label={label}
      onPress={disabled ? undefined : onPress}
      variant="outlined"
      style={style}
    />
  );
}

export function AuthFormDivider({ label }: { label: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={dividerStyles.row}>
      <View style={[dividerStyles.line, { backgroundColor: colors.separator }]} />
      <RNText style={[dividerStyles.label, { color: colors.textMuted }]}>{label}</RNText>
      <View style={[dividerStyles.line, { backgroundColor: colors.separator }]} />
    </View>
  );
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

const dividerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
    textTransform: 'lowercase',
  },
});

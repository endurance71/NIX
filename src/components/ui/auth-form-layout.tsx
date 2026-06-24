import { PropsWithChildren } from 'react';
import { StyleSheet, Text as RNText, View, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FieldGroup, Row, TextInput } from '@expo/ui';
import type { ComponentProps } from 'react';
import type { ObservableState } from '@expo/ui';
import { AppIcon } from './app-icon';
import type { AppIconName } from '../../theme/app-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { AUTH_FORM_HORIZONTAL_PADDING } from '../../theme/authLayout';

// Auth screens use full-screen `AuthFormLayout` → `FieldGroup` as the only scroll container.
// Never nest `FieldGroup` inside RN `ScrollView` or give it a fixed height (Android LazyColumn scrolls).

export function AuthFormLayout({ children, header }: PropsWithChildren<{ header?: React.ReactNode }>) {
  const { statusBarStyle } = useAppTheme();

  return (
    <AppHost useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      {header}
      <FieldGroup style={styles.form}>{children}</FieldGroup>
    </AppHost>
  );
}

export function AuthFormSection({ title, children }: PropsWithChildren<{ title?: string }>) {
  return <FieldGroup.Section title={title}>{children}</FieldGroup.Section>;
}

export function AuthFormHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={headerStyles.wrap}>
      <RNText style={[headerStyles.title, { color: colors.textPrimary }]}>{title}</RNText>
      {description ? (
        <RNText style={[headerStyles.description, { color: colors.textSecondary }]}>{description}</RNText>
      ) : null}
    </View>
  );
}

export function AuthFormFooter({ children }: PropsWithChildren) {
  return <View style={footerStyles.wrap}>{children}</View>;
}

export function AuthSecondaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[textStyles.secondary, { color: colors.textSecondary }]}>
      {children}
    </RNText>
  );
}

export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[textStyles.tertiary, { color: colors.tertiaryLabel }]}>
      {children}
    </RNText>
  );
}

export function AuthErrorText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[textStyles.error, { color: colors.error }]}>
      {children}
    </RNText>
  );
}

type AuthFieldProps = Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> & {
  nativeValue?: ObservableState<string>;
  onChangeText?: (text: string) => void;
  icon?: AppIconName;
};

export function AuthTextField({ nativeValue, onChangeText, placeholder, icon, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();

  const inputEl = (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={nativeValue}
      onChangeText={onChangeText}
      {...rest}
    />
  );

  if (icon) {
    return (
      <Row spacing={8} style={{ paddingVertical: 4 }}>
        <AppIcon name={icon} size={20} color={colors.textSecondary} />
        {inputEl}
      </Row>
    );
  }

  return inputEl;
}

export function AuthSecureField({ nativeValue, onChangeText, placeholder, icon, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();

  const inputEl = (
    <TextInput
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={nativeValue}
      onChangeText={onChangeText}
      {...rest}
    />
  );

  if (icon) {
    return (
      <Row spacing={8} style={{ paddingVertical: 4 }}>
        <AppIcon name={icon} size={20} color={colors.textSecondary} />
        {inputEl}
      </Row>
    );
  }

  return inputEl;
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
  style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <RNText style={styles.primaryButtonLabel}>{label}</RNText>
    </Pressable>
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
  style?: any;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outlinedButton,
        {
          borderColor: colors.buttonPrimaryBg ?? '#0A84FF',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <RNText style={[styles.outlinedButtonLabel, { color: colors.buttonPrimaryBg ?? '#0A84FF' }]}>
        {label}
      </RNText>
    </Pressable>
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

export function AuthSecondaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        {
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <RNText style={styles.secondaryButtonText}>
        {label}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    paddingHorizontal: AUTH_FORM_HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  primaryButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A84FF',
    width: '100%',
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  outlinedButton: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    width: '100%',
  },
  outlinedButtonLabel: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  secondaryButton: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    color: '#0A84FF',
    fontWeight: '600',
  },
});

const headerStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 24,
    paddingBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});

const footerStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
});

const textStyles = StyleSheet.create({
  secondary: {
    fontSize: 14,
    fontFamily: APP_FONT_FAMILY,
    lineHeight: 20,
    textAlign: 'center',
  },
  tertiary: {
    fontSize: 12,
    fontFamily: APP_FONT_FAMILY,
    lineHeight: 16,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
});

const dividerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginVertical: 4,
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


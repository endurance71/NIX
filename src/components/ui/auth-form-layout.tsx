import { PropsWithChildren, ReactNode, ReactElement } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Column, FieldGroup, Text, TextInput } from '@expo/ui';
import { buttonBorderShape, controlSize, frame } from '@expo/ui/swift-ui/modifiers';
import type { ComponentProps } from 'react';
import type { ObservableState } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import {
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_PRIMARY_BUTTON_MIN_HEIGHT,
} from '../../theme/authLayout';
import { authRnTextStyle, authTextStyle } from '../../theme/authTypography';

const AUTH_PRIMARY_BUTTON_IOS_MODIFIERS = [
  frame({ maxWidth: 10_000 }),
  buttonBorderShape('roundedRectangle', 14),
  controlSize('large'),
  frame({ minHeight: AUTH_PRIMARY_BUTTON_MIN_HEIGHT }),
] as const;

// Auth screens use full-screen `AuthFormLayout` → `FieldGroup` as the only scroll container.
// Never nest `FieldGroup` inside RN `ScrollView` or give it a fixed height (Android LazyColumn scrolls).

// Auth screens use full-screen `AuthFormLayout` → `FieldGroup` as the only scroll container.
// Never nest `FieldGroup` inside RN `ScrollView` or give it a fixed height (Android LazyColumn scrolls).
// `FieldGroup` must be a direct child of `AppHost` — do not wrap it in RN `View` siblings.

type AuthFormLayoutProps = PropsWithChildren<{
  /**
   * Pure React Native element rendered above the FieldGroup.
   * Use this for content that contains RNHostView (e.g. brand logo + tagline)
   * to avoid the broken SectionHeader + RNHostView overlap bug on iOS.
   */
  header?: ReactElement;
}>;

export function AuthFormLayout({ children, header }: AuthFormLayoutProps) {
  const { statusBarStyle } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('fullscreen');

  if (header) {
    return (
      <View style={layoutStyles.screenWrap}>
        <StatusBar style={statusBarStyle} />
        <View style={[layoutStyles.headerSlot, { paddingTop: topContentInset + 8 }]}>
          {header}
        </View>
        <AppHost safeAreaMode="keyboardOnly" useViewportSizeMeasurement style={layoutStyles.hostFill}>
          <FieldGroup
            style={{
              ...styles.form,
              paddingBottom: bottomContentInset + 32,
            }}>
            {children}
          </FieldGroup>
        </AppHost>
      </View>
    );
  }

  return (
    <AppHost safeAreaMode="keyboardOnly" useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <FieldGroup
        style={{
          ...styles.form,
          paddingTop: topContentInset + 8,
          paddingBottom: bottomContentInset + 32,
        }}>
        {children}
      </FieldGroup>
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

  const headerStyle = { ...headerStyles.wrap, ...headerStyles.wrapFullWidth };

  return (
    <Column
      spacing={8}
      style={headerStyle}>
      <Text textStyle={{ ...authTextStyle('screenTitle', colors), textAlign: 'center' }}>{title}</Text>
      {description ? (
        <Text textStyle={{ ...authTextStyle('screenSubtitle', colors), textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
    </Column>
  );
}

export function AuthFormFooter({ children }: PropsWithChildren) {
  return <View style={footerStyles.wrap}>{children}</View>;
}

export function AuthSecondaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ ...authTextStyle('screenSubtitle', colors), textAlign: 'center' }}>
      {children}
    </Text>
  );
}

export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ ...authTextStyle('fieldLabel', colors), textAlign: 'center' }}>
      {children}
    </Text>
  );
}

export function AuthErrorText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text textStyle={{ ...authTextStyle('error', colors), textAlign: 'center' }}>{children}</Text>
  );
}

type AuthFieldProps = Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> & {
  nativeValue?: ObservableState<string>;
  onChangeText?: (text: string) => void;
};

export function AuthTextField({ nativeValue, onChangeText, placeholder, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();

  return (
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
}

export function AuthSecureField({ nativeValue, onChangeText, placeholder, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();

  return (
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
}

export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: unknown;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      modifiers={[...AUTH_PRIMARY_BUTTON_IOS_MODIFIERS]}
    />
  );
}

export function AuthTextLinkButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return <Button label={label} variant="text" onPress={onPress} />;
}

export function AuthOutlinedButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: unknown;
}) {
  return <Button label={label} variant="outlined" onPress={onPress} disabled={disabled} />;
}

export function AuthFormDivider({ label }: { label: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={dividerStyles.row}>
      <View style={[dividerStyles.line, { backgroundColor: colors.separator }]} />
      <RNText style={[dividerStyles.label, authRnTextStyle('divider', colors)]}>{label}</RNText>
      <View style={[dividerStyles.line, { backgroundColor: colors.separator }]} />
    </View>
  );
}

export function AuthSecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
  style?: unknown;
}) {
  return <Button label={label} variant="text" onPress={onPress} />;
}

export function AuthInlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthTextLinkButton label={label} onPress={onPress} />;
}

export function AuthFooterPrompt({
  prompt,
  linkLabel,
  onPress,
}: {
  prompt?: string;
  linkLabel: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={footerPromptStyles.wrap}>
      <RNText style={authRnTextStyle('footerPrompt', colors)}>
        {prompt ? (
          <>
            {prompt}{' '}
            <RNText onPress={onPress} style={authRnTextStyle('footerLink', colors)}>
              {linkLabel}
            </RNText>
          </>
        ) : (
          <RNText onPress={onPress} style={authRnTextStyle('footerLink', colors)}>
            {linkLabel}
          </RNText>
        )}
      </RNText>
    </View>
  );
}

export function AuthActionsSection({
  error,
  children,
}: {
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      {error ? <AuthErrorText>{error}</AuthErrorText> : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: AUTH_FORM_HORIZONTAL_PADDING,
  },
});

const layoutStyles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  hostFill: {
    flex: 1,
  },
  headerSlot: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: AUTH_FORM_HORIZONTAL_PADDING,
    paddingBottom: 8,
  },
});


const headerStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  wrapFullWidth: {
    width: '100%',
  },
});

const footerStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 16,
  },
});

const dividerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginVertical: 12,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    textTransform: 'lowercase',
  },
});

const footerPromptStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
});

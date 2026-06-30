import React, { Children, PropsWithChildren, ReactNode, ReactElement } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { authRnTextStyle } from '../../theme/authTypography';
import {
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_PRIMARY_BUTTON_MIN_HEIGHT,
} from '../../theme/authLayout';

// ObservableState stub / type for compatibility
export type ObservableState<T> = {
  value: T;
};

type AuthFieldProps = Omit<ComponentProps<typeof RNTextInput>, 'value' | 'onChangeText'> & {
  nativeValue?: ObservableState<string> | string;
  onChangeText?: (text: string) => void;
};

const getValue = (val: ObservableState<string> | string | undefined): string => {
  if (!val) return '';
  if (typeof val === 'object' && 'value' in val) {
    return val.value;
  }
  return val;
};

// Custom FieldGroup matching native HIG cards but fully in React Native
export function FieldGroup({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[styles.fieldGroup, style]}>{children}</View>;
}

FieldGroup.SectionHeader = function FieldGroupSectionHeader({ children }: { children: ReactNode }) {
  return <View style={styles.sectionHeaderInner}>{children}</View>;
};

FieldGroup.SectionFooter = function FieldGroupSectionFooter({ children }: { children: ReactNode }) {
  return <View style={styles.sectionFooterInner}>{children}</View>;
};

FieldGroup.Section = function FieldGroupSection({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { colors } = useAppTheme();
  
  const header: ReactNode[] = [];
  const footer: ReactNode[] = [];
  const content: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === FieldGroup.SectionHeader) {
        header.push(child);
      } else if (child.type === FieldGroup.SectionFooter) {
        footer.push(child);
      } else {
        content.push(child);
      }
    } else {
      content.push(child);
    }
  });

  return (
    <View style={styles.sectionWrap}>
      {title ? (
        <RNText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {title}
        </RNText>
      ) : null}
      {header.length > 0 ? <View>{header}</View> : null}
      
      {content.length > 0 && (
        <View style={[styles.sectionCard, { backgroundColor: colors.tertiarySystemBackground, borderColor: colors.separator }]}>
          {Children.map(content, (child, index) => {
            if (!child) return null;
            const isLast = index === content.length - 1;
            return (
              <View style={styles.rowContainer}>
                {child}
                {!isLast && <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />}
              </View>
            );
          })}
        </View>
      )}
      
      {footer.length > 0 ? <View>{footer}</View> : null}
    </View>
  );
};

type AuthFormLayoutProps = PropsWithChildren<{
  header?: ReactElement;
  contentVerticalAlignment?: 'top' | 'center';
}>;

export function AuthFormLayout({
  children,
  header,
  contentVerticalAlignment = 'top',
}: AuthFormLayoutProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('fullscreen');
  const { height: windowHeight } = useWindowDimensions();

  const minHeight = windowHeight - topContentInset - bottomContentInset;

  return (
    <View style={[styles.screenWrap, { backgroundColor: colors.background }]}>
      <StatusBar style={statusBarStyle} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topContentInset + (header ? 8 : 24),
            paddingBottom: bottomContentInset + 32,
            justifyContent: contentVerticalAlignment === 'center' ? 'center' : 'flex-start',
            minHeight,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {header ? <View style={styles.headerSlot}>{header}</View> : null}
        <View style={styles.formContainer}>
          <FieldGroup>
            {children}
          </FieldGroup>
        </View>
      </ScrollView>
    </View>
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
    <View style={styles.headerWrap}>
      <RNText style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</RNText>
      {description ? (
        <RNText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {description}
        </RNText>
      ) : null}
    </View>
  );
}

export function AuthFormFooter({ children }: PropsWithChildren) {
  return <View style={styles.footerWrap}>{children}</View>;
}

export function AuthSecondaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[styles.secondaryText, { color: colors.textSecondary }]}>
      {children}
    </RNText>
  );
}

export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[styles.tertiaryText, { color: colors.textMuted }]}>
      {children}
    </RNText>
  );
}

export function AuthErrorText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <RNText style={[styles.errorText, { color: colors.error }]}>
      {children}
    </RNText>
  );
}

export function AuthTextField({ nativeValue, onChangeText, placeholder, style, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();
  const valueStr = getValue(nativeValue);

  return (
    <RNTextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={valueStr}
      onChangeText={onChangeText}
      style={[styles.input, { color: colors.textPrimary }, style]}
      {...rest}
    />
  );
}

export function AuthSecureField({ nativeValue, onChangeText, placeholder, style, ...rest }: AuthFieldProps) {
  const { colors } = useAppTheme();
  const valueStr = getValue(nativeValue);

  return (
    <RNTextInput
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={valueStr}
      onChangeText={onChangeText}
      style={[styles.input, { color: colors.textPrimary }, style]}
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
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: colors.accent,
          opacity: disabled ? 0.6 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <RNText style={styles.primaryButtonText}>{label}</RNText>
    </Pressable>
  );
}

export function AuthSecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.5 : 1 }]}
    >
      <RNText style={[styles.secondaryButtonText, { color: colors.accent }]}>
        {label}
      </RNText>
    </Pressable>
  );
}

export function AuthTextLinkButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return <AuthSecondaryButton label={label} onPress={onPress} />;
}

export function AuthOutlinedButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outlinedButton,
        {
          borderColor: colors.accent,
          opacity: disabled ? 0.6 : pressed ? 0.5 : 1,
        },
      ]}
    >
      <RNText style={[styles.outlinedButtonText, { color: colors.accent }]}>
        {label}
      </RNText>
    </Pressable>
  );
}

export function AuthFormDivider({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
      <RNText style={[styles.dividerLabel, authRnTextStyle('divider', colors)]}>{label}</RNText>
      <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
    </View>
  );
}

export function AuthInlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthSecondaryButton label={label} onPress={onPress} />;
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
    <View style={styles.footerPromptWrap}>
      <RNText style={[styles.footerPromptText, { color: colors.textSecondary }]}>
        {prompt ? `${prompt} ` : null}
        <RNText
          onPress={onPress}
          style={[styles.footerPromptLink, { color: colors.accent }]}
        >
          {linkLabel}
        </RNText>
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
    <View style={styles.actionsWrap}>
      {error ? <AuthErrorText>{error}</AuthErrorText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: AUTH_FORM_HORIZONTAL_PADDING,
    alignItems: 'center',
    gap: 16,
  },
  headerSlot: {
    width: '100%',
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
  },
  fieldGroup: {
    width: '100%',
    gap: 20,
  },
  sectionWrap: {
    width: '100%',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionCard: {
    width: '100%',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rowContainer: {
    width: '100%',
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  sectionHeaderInner: {
    width: '100%',
    paddingBottom: 8,
  },
  sectionFooterInner: {
    width: '100%',
    paddingTop: 8,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    fontSize: 17,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '400',
  },
  headerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    width: '100%',
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    marginTop: 8,
  },
  footerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 16,
  },
  secondaryText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
  },
  tertiaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    width: '100%',
    height: AUTH_PRIMARY_BUTTON_MIN_HEIGHT,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '500',
    textAlign: 'center',
  },
  outlinedButton: {
    width: '100%',
    height: AUTH_PRIMARY_BUTTON_MIN_HEIGHT,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedButtonText: {
    fontSize: 16,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    textTransform: 'lowercase',
  },
  footerPromptWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerPromptText: {
    fontSize: 15,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '400',
    textAlign: 'center',
  },
  footerPromptLink: {
    fontWeight: '600',
  },
  actionsWrap: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 4,
  },
});

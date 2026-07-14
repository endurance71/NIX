import React, {
  Children,
  forwardRef,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
} from 'react';
import { AccessibilityInfo, PixelRatio, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Text, TextInput, type TextInputProps, type TextInputRef } from '@expo/ui';
import { HStack, Rectangle, ScrollView, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  onTapGesture,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_FIELD_GROUP_CORNER_RADIUS,
  AUTH_FIELD_INNER_PADDING,
  AUTH_FIELD_LABELED_ROW_MIN_HEIGHT,
  AUTH_FIELD_ROW_MIN_HEIGHT,
  AUTH_FIELD_SEPARATOR_INSET,
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_OR_DIVIDER_GAP,
  AUTH_SECONDARY_TOP_PADDING,
  AUTH_SECTION_GAP,
  getAuthContentWidth,
  getAuthElevatedSurfaceColor,
  getAuthOrDividerLineWidth,
} from '../../theme/authLayout';
import { AuthContentWidthContext, useAuthContentWidth } from './auth-content-width';
import { AppHost } from './app-host';

export type ObservableState<T> = { value: T };

export { useAuthContentWidth } from './auth-content-width';

type AuthFormLayoutProps = PropsWithChildren<{
  description?: string;
}>;

function getValue(value: ObservableState<string> | string | undefined): string {
  if (typeof value === 'string') return value;
  return value?.value ?? '';
}

function contentColumnModifiers(contentWidth: number) {
  return [frame({ width: contentWidth, alignment: 'leading' })];
}

function AuthFieldSeparator() {
  const { colors } = useAppTheme();

  return (
    <HStack spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
      <Rectangle
        modifiers={[
          foregroundStyle(colors.separator),
          frame({ maxWidth: Infinity, height: 0.5 }),
          padding({ leading: AUTH_FIELD_SEPARATOR_INSET }),
        ]}
      />
    </HStack>
  );
}

export function AuthFieldGroup({
  children,
  footer,
  labeled = false,
}: PropsWithChildren<{ footer?: ReactNode; labeled?: boolean }>) {
  const { colors, isDark } = useAppTheme();
  const contentWidth = useAuthContentWidth();
  const items = Children.toArray(children).filter(Boolean);
  const rowMinHeight = labeled ? AUTH_FIELD_LABELED_ROW_MIN_HEIGHT : AUTH_FIELD_ROW_MIN_HEIGHT;
  const rowVerticalPadding = labeled ? 12 : AUTH_FIELD_INNER_PADDING;
  const rowAlignment = labeled ? 'leading' : 'center';
  const surfaceColor = getAuthElevatedSurfaceColor(colors, isDark);

  return (
    <VStack
      spacing={0}
      modifiers={[
        ...contentColumnModifiers(contentWidth),
        background(surfaceColor, shapes.roundedRectangle({ cornerRadius: AUTH_FIELD_GROUP_CORNER_RADIUS })),
        clipShape('roundedRectangle', AUTH_FIELD_GROUP_CORNER_RADIUS),
      ]}>
      {items.map((child, index) => (
        <React.Fragment key={isValidElement(child) && child.key != null ? String(child.key) : index}>
          {index > 0 ? <AuthFieldSeparator /> : null}
          <VStack
            spacing={0}
            modifiers={[
              frame({ maxWidth: Infinity, minHeight: rowMinHeight, alignment: rowAlignment }),
              padding({
                horizontal: AUTH_FIELD_INNER_PADDING,
                vertical: rowVerticalPadding,
              }),
            ]}>
            {child}
          </VStack>
        </React.Fragment>
      ))}
      {footer ? (
        <>
          {items.length > 0 ? <AuthFieldSeparator /> : null}
          <VStack
            spacing={0}
            modifiers={[
              frame({ maxWidth: Infinity, alignment: 'leading' }),
              padding({
                horizontal: AUTH_FIELD_INNER_PADDING,
                vertical: AUTH_FIELD_INNER_PADDING,
              }),
            ]}>
            {footer}
          </VStack>
        </>
      ) : null}
    </VStack>
  );
}

export function AuthFormLayout({ children, description }: AuthFormLayoutProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = getAuthContentWidth(windowWidth);

  return (
    <AuthContentWidthContext.Provider value={{ contentWidth }}>
      <AppHost
        style={{ flex: 1, backgroundColor: colors.background }}
        safeAreaMode="respect"
        useViewportSizeMeasurement>
        <StatusBar style={statusBarStyle} />
        <ScrollView
          axes="vertical"
          showsIndicators={false}
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
          <VStack
            alignment="center"
            spacing={0}
            modifiers={[
              padding({
                top: AUTH_SECONDARY_TOP_PADDING,
                leading: AUTH_FORM_HORIZONTAL_PADDING,
                bottom: AUTH_FORM_HORIZONTAL_PADDING,
                trailing: AUTH_FORM_HORIZONTAL_PADDING,
              }),
              frame({ maxWidth: Infinity, alignment: 'top' }),
            ]}>
            <VStack
              alignment="leading"
              spacing={AUTH_SECTION_GAP}
              modifiers={contentColumnModifiers(contentWidth)}>
              {description ? (
                <Text
                  modifiers={[
                    font({ textStyle: 'subheadline' }),
                    foregroundStyle(colors.secondaryLabel),
                    multilineTextAlignment('leading'),
                    frame({ width: contentWidth, alignment: 'leading' }),
                  ]}>
                  {description}
                </Text>
              ) : null}
              {children}
            </VStack>
          </VStack>
        </ScrollView>
      </AppHost>
    </AuthContentWidthContext.Provider>
  );
}

export const AuthTextField = forwardRef<TextInputRef, AuthFieldProps>(function AuthTextField(
  { nativeValue, autoCapitalize = 'none', autoCorrect = false, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      defaultValue={getValue(nativeValue)}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      modifiers={[frame({ maxWidth: Infinity })]}
      {...props}
    />
  );
});

export const AuthSecureField = forwardRef<TextInputRef, AuthFieldProps>(function AuthSecureField(
  { nativeValue, autoCapitalize = 'none', autoCorrect = false, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      defaultValue={getValue(nativeValue)}
      secureTextEntry
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      modifiers={[frame({ maxWidth: Infinity })]}
      {...props}
    />
  );
});

type AuthFieldProps = Omit<TextInputProps, 'value' | 'defaultValue'> & {
  nativeValue?: ObservableState<string> | string;
};

export function AuthSecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      label={label}
      variant="text"
      onPress={onPress}
      modifiers={[controlSize('regular'), frame({ minHeight: 44, alignment: 'center' })]}
    />
  );
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
  const contentWidth = useAuthContentWidth();
  const useVerticalLayout = PixelRatio.getFontScale() >= 1.235;

  if (useVerticalLayout) {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[frame({ width: contentWidth, minHeight: 44, alignment: 'leading' })]}>
        {prompt ? (
          <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(colors.secondaryLabel)]}>
            {prompt}
          </Text>
        ) : null}
        <AuthInlineLink label={linkLabel} onPress={onPress} />
      </VStack>
    );
  }

  if (!prompt) {
    return <AuthInlineLink label={linkLabel} onPress={onPress} />;
  }

  return (
    <HStack
      alignment="center"
      spacing={0}
      modifiers={[frame({ width: contentWidth, minHeight: 44, alignment: 'leading' })]}>
      <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(colors.secondaryLabel)]}>
        {`${prompt} `}
      </Text>
      <Text
        modifiers={[
          font({ textStyle: 'subheadline', weight: 'semibold' }),
          foregroundStyle(colors.label),
          onTapGesture(onPress),
        ]}>
        {linkLabel}
      </Text>
    </HStack>
  );
}

export function AuthTextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Text
      modifiers={[
        font({ textStyle: 'subheadline' }),
        foregroundStyle(colors.systemBlue),
        onTapGesture(onPress),
      ]}>
      {label}
    </Text>
  );
}

export function AuthLeadingLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();

  return (
    <HStack
      alignment="center"
      spacing={0}
      modifiers={[frame({ width: contentWidth, minHeight: 44, alignment: 'leading' })]}>
      <Text
        modifiers={[
          font({ textStyle: 'subheadline', weight: 'semibold' }),
          foregroundStyle(colors.label),
          onTapGesture(onPress),
        ]}>
        {label}
      </Text>
    </HStack>
  );
}

/** @deprecated Use AuthLeadingLink */
export function AuthTrailingLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthLeadingLink label={label} onPress={onPress} />;
}

export function AuthSecondaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(colors.secondaryLabel)]}>
      {children}
    </Text>
  );
}

export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(colors.tertiaryLabel)]}>
      {children}
    </Text>
  );
}

export function AuthHighlightedText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(colors.label)]}>
      {children}
    </Text>
  );
}

export function AuthErrorText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(children);
  }, [children]);

  return (
    <Text
      modifiers={[
        font({ textStyle: 'footnote', weight: 'semibold' }),
        foregroundStyle(colors.destructive),
        frame({ width: contentWidth, alignment: 'leading' }),
      ]}>
      {children}
    </Text>
  );
}

export function AuthFormDivider({ label }: { label: string }) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();
  const lineWidth = getAuthOrDividerLineWidth(contentWidth, label.toLocaleLowerCase());

  return (
    <HStack
      alignment="center"
      spacing={AUTH_OR_DIVIDER_GAP}
      modifiers={[frame({ width: contentWidth, alignment: 'center' })]}>
      <Rectangle
        modifiers={[foregroundStyle(colors.separator), frame({ width: lineWidth, height: 0.5 })]}
      />
      <Text
        modifiers={[
          font({ textStyle: 'footnote', weight: 'medium' }),
          foregroundStyle(colors.secondaryLabel),
        ]}>
        {label.toLocaleLowerCase()}
      </Text>
      <Rectangle
        modifiers={[foregroundStyle(colors.separator), frame({ width: lineWidth, height: 0.5 })]}
      />
    </HStack>
  );
}

export function AuthEmailDescription({
  body,
  email,
}: {
  body: string;
  email: string;
}) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();
  const emailIndex = body.indexOf(email);
  const before = emailIndex >= 0 ? body.slice(0, emailIndex) : body;
  const after = emailIndex >= 0 ? body.slice(emailIndex + email.length) : '';

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      {before ? (
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle(colors.secondaryLabel),
            multilineTextAlignment('leading'),
          ]}>
          {before.trimEnd()}
        </Text>
      ) : null}
      {emailIndex >= 0 ? <AuthHighlightedText>{email}</AuthHighlightedText> : null}
      {after ? (
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle(colors.secondaryLabel),
            multilineTextAlignment('leading'),
          ]}>
          {after.trimStart()}
        </Text>
      ) : null}
    </VStack>
  );
}

export function AuthFormSection({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function AuthFormFooter({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AuthTextLinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthSecondaryButton label={label} onPress={onPress} />;
}

export function AuthInlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthSecondaryButton label={label} onPress={onPress} />;
}

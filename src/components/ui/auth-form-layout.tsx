import React, {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  use,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, PixelRatio, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Button, Text, TextInput, type TextInputProps, type TextInputRef } from '@expo/ui';
import { Button as SwiftButton, HStack, Image as SwiftImage, Rectangle, ScrollView, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  onTapGesture,
  padding,
  scrollDismissesKeyboard,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
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
import { spacing } from '../../theme/spacing';
import { AuthContentWidthContext, useAuthContentWidth } from './auth-content-width';
import { AppHost } from './app-host';

// Lets a field tell the group row it sits in how to focus it, so a tap anywhere in the row (its
// padding and label included) lands in the field instead of only on the line of text.
const AuthFieldRowFocusContext = createContext<((field: TextInputRef | null) => void) | null>(null);

/** One card row. Becomes a single tap target when it holds a text or password field. */
function AuthFieldRow({
  children,
  minHeight,
  verticalPadding,
  alignment,
}: PropsWithChildren<{ minHeight: number; verticalPadding: number; alignment: 'leading' | 'center' }>) {
  const [field, setField] = useState<TextInputRef | null>(null);

  return (
    <AuthFieldRowFocusContext.Provider value={setField}>
      <VStack
        spacing={0}
        modifiers={[
          frame({ maxWidth: Infinity, minHeight, alignment }),
          padding({ horizontal: AUTH_FIELD_INNER_PADDING, vertical: verticalPadding }),
          ...(field ? [contentShape(shapes.rectangle()), onTapGesture(() => field.focus())] : []),
        ]}>
        {children}
      </VStack>
    </AuthFieldRowFocusContext.Provider>
  );
}

/** Forwards the field's ref and registers it with the surrounding group row. */
function useAuthFieldRef(ref: React.ForwardedRef<TextInputRef>) {
  const inputRef = useRef<TextInputRef>(null);
  const registerWithRow = use(AuthFieldRowFocusContext);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => inputRef.current?.clear(),
      isFocused: () => inputRef.current?.isFocused() ?? false,
      setSelection: (start, end) => inputRef.current?.setSelection(start, end) ?? Promise.resolve(),
    }),
    []
  );
  useEffect(() => {
    if (!registerWithRow) return;
    registerWithRow(inputRef.current);
    return () => registerWithRow(null);
  }, [registerWithRow]);
  return inputRef;
}

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
          frame({ maxWidth: Infinity, minHeight: 0.5, maxHeight: 0.5 }),
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

  const card = (
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
          <AuthFieldRow minHeight={rowMinHeight} verticalPadding={rowVerticalPadding} alignment={rowAlignment}>
            {child}
          </AuthFieldRow>
        </React.Fragment>
      ))}
    </VStack>
  );
  if (!footer) return card;

  // The hint sits under the card like an iOS section footer. Inside the card, the hairline above
  // it read as the line to write on.
  return (
    <VStack alignment="leading" spacing={spacing.sm} modifiers={contentColumnModifiers(contentWidth)}>
      {card}
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), padding({ horizontal: AUTH_FIELD_INNER_PADDING })]}>
        {footer}
      </VStack>
    </VStack>
  );
}

export function AuthFormLayout({ children, description }: AuthFormLayoutProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = getAuthContentWidth(windowWidth);
  const contentWidthValue = useMemo(() => ({ contentWidth }), [contentWidth]);

  return (
    <AuthContentWidthContext.Provider value={contentWidthValue}>
      <AppHost
        style={{ flex: 1, backgroundColor: colors.background }}
        safeAreaMode="respect"
        useViewportSizeMeasurement>
        <StatusBar style={statusBarStyle} />
        <ScrollView
          axes="vertical"
          showsIndicators={false}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            scrollDismissesKeyboard('interactively'),
          ]}>
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
                    font({ design: 'rounded', textStyle: 'subheadline' }),
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
  const inputRef = useAuthFieldRef(ref);
  return (
    <TextInput
      ref={inputRef}
      defaultValue={getValue(nativeValue)}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      modifiers={[frame({ maxWidth: Infinity })]}
      {...props}
    />
  );
});

/** Optional eye button: one press shows the typed password, another hides it again. */
type PasswordRevealToggle = {
  revealed: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
};

export const AuthSecureField = forwardRef<
  TextInputRef,
  AuthFieldProps & { revealed?: boolean; revealToggle?: PasswordRevealToggle }
>(function AuthSecureField(
  { nativeValue, autoCapitalize = 'none', autoCorrect = false, revealed = false, revealToggle, ...props },
  ref
) {
  const { colors } = useAppTheme();
  const inputRef = useAuthFieldRef(ref);
  const field = (
    <TextInput
      ref={inputRef}
      defaultValue={getValue(nativeValue)}
      secureTextEntry={!revealed}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      modifiers={[frame({ maxWidth: Infinity })]}
      {...props}
    />
  );
  if (!revealToggle) return field;
  return (
    <HStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
      {field}
      <SwiftButton
        onPress={revealToggle.onToggle}
        modifiers={[
          buttonStyle('plain'),
          frame({ width: 44, height: 44 }),
          swiftAccessibilityLabel(revealToggle.revealed ? revealToggle.hideLabel : revealToggle.showLabel),
        ]}>
        <SwiftImage
          systemName={resolveAppIconName(revealToggle.revealed ? 'eyeSlash' : 'eye') as SFSymbol}
          size={APP_ICON_SIZE.md}
          color={colors.secondaryLabel}
        />
      </SwiftButton>
    </HStack>
  );
});

type AuthFieldProps = Omit<TextInputProps, 'value' | 'defaultValue'> & {
  nativeValue?: ObservableState<string> | string;
};

export function AuthSecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      label={label}
      variant="text"
      onPress={onPress}
      disabled={disabled}
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
        modifiers={[frame({ minWidth: contentWidth, maxWidth: contentWidth, minHeight: 44, alignment: 'leading' })]}>
        {prompt ? (
          <Text modifiers={[font({ design: 'rounded', textStyle: 'subheadline' }), foregroundStyle(colors.secondaryLabel)]}>
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
      modifiers={[frame({ minWidth: contentWidth, maxWidth: contentWidth, minHeight: 44, alignment: 'leading' })]}>
      <Text modifiers={[font({ design: 'rounded', textStyle: 'subheadline' }), foregroundStyle(colors.secondaryLabel)]}>
        {`${prompt} `}
      </Text>
      <Text
        modifiers={[
          font({ design: 'rounded', textStyle: 'subheadline', weight: 'semibold' }),
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
        font({ design: 'rounded', textStyle: 'subheadline' }),
        foregroundStyle(colors.systemBlue),
        onTapGesture(onPress),
      ]}>
      {label}
    </Text>
  );
}

// Field footers carry real information (privacy of the birth date, username rules), so they use
// the secondary label like iOS section footers; tertiary is too faint (~2.3:1).
export function AuthTertiaryText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text modifiers={[font({ design: 'rounded', textStyle: 'footnote' }), foregroundStyle(colors.secondaryLabel)]}>
      {children}
    </Text>
  );
}

export function AuthHighlightedText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text modifiers={[font({ design: 'rounded', textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(colors.label)]}>
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
        font({ design: 'rounded', textStyle: 'footnote', weight: 'semibold' }),
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
  const { fontScale } = useWindowDimensions();
  const lineWidth = getAuthOrDividerLineWidth(
    contentWidth,
    label.toLocaleLowerCase(),
    AUTH_OR_DIVIDER_GAP,
    fontScale,
  );

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
          font({ design: 'rounded', textStyle: 'footnote', weight: 'medium' }),
          foregroundStyle(colors.secondaryLabel),
          fixedSize({ horizontal: true, vertical: false }),
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
  const rest = emailIndex >= 0 ? body.slice(emailIndex + email.length) : '';
  // The e-mail sits on its own line; the punctuation that ends its sentence stays with it, so the
  // next line does not start with ". Open the link…".
  const trailingPunctuation = /^[.,:;!?]+/.exec(rest)?.[0] ?? '';
  const after = rest.slice(trailingPunctuation.length);

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      {before ? (
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'subheadline' }),
            foregroundStyle(colors.secondaryLabel),
            multilineTextAlignment('leading'),
          ]}>
          {before.trimEnd()}
        </Text>
      ) : null}
      {emailIndex >= 0 ? <AuthHighlightedText>{`${email}${trailingPunctuation}`}</AuthHighlightedText> : null}
      {after.trim() ? (
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'subheadline' }),
            foregroundStyle(colors.secondaryLabel),
            multilineTextAlignment('leading'),
          ]}>
          {after.trimStart()}
        </Text>
      ) : null}
    </VStack>
  );
}

function AuthInlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <AuthSecondaryButton label={label} onPress={onPress} />;
}

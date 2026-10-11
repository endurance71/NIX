import { Text } from '@expo/ui';
import { Button, Label, VStack } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  foregroundStyle,
  frame,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { AuthFormDivider } from '../../ui/auth-form-layout';
import { AuthAppleSignInButton } from '../../ui/auth-apple-sign-in-button';
import { useAuthContentWidth } from '../../ui/auth-content-width';
import {
  AUTH_LOGIN_FORM_INNER_GAP,
  AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP,
  AUTH_SOCIAL_BUTTON_HEIGHT,
  AUTH_SOCIAL_BUTTON_RADIUS,
} from '../../../theme/authLayout';
import { resolveAppIconName } from '../../../theme/app-icons';
import type { LoginScreenViewModel } from '../../../hooks/useLoginScreen';

type LoginAlternativeAuthSectionProps = {
  vm: LoginScreenViewModel;
};

export function LoginAlternativeAuthSection({ vm }: LoginAlternativeAuthSectionProps) {
  const contentWidth = useAuthContentWidth();
  const { colors } = useAppTheme();

  return (
    <VStack
      alignment="leading"
      spacing={AUTH_LOGIN_FORM_INNER_GAP}
      modifiers={[
        frame({ width: contentWidth, alignment: 'leading' }),
        padding({ top: AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP }),
      ]}>
      <AuthFormDivider label={vm.t('auth.orContinueWith')} />
      {vm.showAppleSignIn ? (
        <AuthAppleSignInButton disabled={vm.authBusy} onPress={() => void vm.handleAppleSignIn()} />
      ) : null}
      {vm.showPasskeySignIn ? (
        // System bordered button: the passkey sheet itself is Apple UI, so the entry point stays
        // a plain native control next to the official Apple button.
        <Button
          onPress={() => void vm.handlePasskeySignIn()}
          modifiers={[
            buttonStyle('bordered'),
            buttonBorderShape('roundedRectangle', AUTH_SOCIAL_BUTTON_RADIUS),
            controlSize('large'),
            tint(colors.label),
            disabled(vm.authBusy),
            frame({ width: contentWidth }),
          ]}>
          <Label
            title={vm.passkeyLoading ? vm.t('auth.passkeySigningIn') : vm.t('auth.passkeySignIn')}
            systemImage={resolveAppIconName('passkey')}
            modifiers={[
              font({ design: 'rounded', textStyle: 'headline' }),
              frame({ maxWidth: Infinity, minHeight: AUTH_SOCIAL_BUTTON_HEIGHT - 16 }),
            ]}
          />
        </Button>
      ) : null}
      {/* Apple sign-in records legal acceptance, so state it before the user continues. */}
      {vm.showAppleSignIn ? (
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'footnote' }),
            foregroundStyle(colors.secondaryLabel),
            frame({ width: contentWidth, alignment: 'leading' }),
          ]}>
          {vm.t('auth.appleLegalConsent')}
        </Text>
      ) : null}
    </VStack>
  );
}

import { Text } from '@expo/ui';
import { VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { AuthFormDivider } from '../../ui/auth-form-layout';
import { AuthAppleSignInButton } from '../../ui/auth-apple-sign-in-button';
import { useAuthContentWidth } from '../../ui/auth-content-width';
import { AUTH_LOGIN_FORM_INNER_GAP, AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP } from '../../../theme/authLayout';
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
      <AuthAppleSignInButton disabled={vm.authBusy} onPress={() => void vm.handleAppleSignIn()} />
      {/* Apple sign-in records legal acceptance, so state it before the user continues. */}
      <Text
        modifiers={[
          font({ textStyle: 'footnote' }),
          foregroundStyle(colors.secondaryLabel),
          frame({ width: contentWidth, alignment: 'leading' }),
        ]}>
        {vm.t('auth.appleLegalConsent')}
      </Text>
    </VStack>
  );
}

import { router } from 'expo-router';
import { HStack, VStack } from '@expo/ui/swift-ui';
import { frame, padding } from '@expo/ui/swift-ui/modifiers';
import { AuthFooterPrompt, AuthTextLink } from '../../ui/auth-form-layout';
import { AuthPrimaryButton } from '../../ui/auth-primary-button';
import { useAuthContentWidth } from '../../ui/auth-content-width';
import {
  AUTH_LOGIN_CTA_TO_PROMPT_GAP,
  AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP,
} from '../../../theme/authLayout';
import type { LoginScreenViewModel } from '../../../hooks/useLoginScreen';

type LoginActionsSectionProps = {
  vm: LoginScreenViewModel;
};

export function LoginActionsSection({ vm }: LoginActionsSectionProps) {
  const contentWidth = useAuthContentWidth();

  return (
    <VStack
      alignment="leading"
      spacing={AUTH_LOGIN_CTA_TO_PROMPT_GAP}
      modifiers={[
        frame({ width: contentWidth, alignment: 'leading' }),
        padding({ top: AUTH_LOGIN_FORGOT_TO_ACTIONS_GAP }),
      ]}>
      <AuthPrimaryButton
        label={vm.t('auth.loginButton')}
        loading={vm.loading}
        onPress={() => void vm.handleSignIn()}
        disabled={vm.authBusy}
      />
      <AuthFooterPrompt
        prompt={vm.t('auth.noAccountPrompt')}
        linkLabel={vm.t('auth.noAccountLink')}
        onPress={vm.goToRegister}
      />
      <HStack alignment="center" spacing={12} modifiers={[frame({ width: contentWidth, minHeight: 44 })]}>
        <AuthTextLink
          label={vm.t('profile.privacyPolicy')}
          onPress={() => router.push('/(auth)/privacy-policy')}
        />
        <AuthTextLink
          label={vm.t('profile.terms')}
          onPress={() => router.push('/(auth)/terms')}
        />
      </HStack>
    </VStack>
  );
}

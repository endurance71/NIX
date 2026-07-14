import { useRef } from 'react';
import type { TextInputRef } from '@expo/ui';
import { LoginActionsSection } from './login/login-actions-section';
import { LoginAlternativeAuthSection } from './login/login-alternative-auth-section';
import { LoginCredentialsSection } from './login/login-credentials-section';
import { LoginHeroSection } from './login/login-hero-section';
import { LoginAuthLayout } from './LoginAuthLayout';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const passwordRef = useRef<TextInputRef>(null);

  return (
    <LoginAuthLayout>
      <LoginHeroSection />
      <LoginCredentialsSection vm={vm} passwordRef={passwordRef} />
      <LoginActionsSection vm={vm} />
      {vm.showAppleSignIn ? <LoginAlternativeAuthSection vm={vm} /> : null}
    </LoginAuthLayout>
  );
}

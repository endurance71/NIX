import { useRef } from 'react';
import type { TextInputRef } from '@expo/ui';
import { LoginActionsSection } from './login/login-actions-section';
import { LoginAlternativeAuthSection } from './login/login-alternative-auth-section';
import { LoginCredentialsSection } from './login/login-credentials-section';
import { LoginAuthLayout } from './LoginAuthLayout';
import { LoginStage } from './LoginStage';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

/** Login on the welcome stage: drawn logo and glow behind the native form. */
export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const passwordRef = useRef<TextInputRef>(null);

  return (
    <LoginStage>
      {(formTop) => (
        <LoginAuthLayout formTop={formTop}>
          <LoginCredentialsSection vm={vm} passwordRef={passwordRef} />
          <LoginActionsSection vm={vm} />
          {vm.showAppleSignIn || vm.showPasskeySignIn ? <LoginAlternativeAuthSection vm={vm} /> : null}
        </LoginAuthLayout>
      )}
    </LoginStage>
  );
}

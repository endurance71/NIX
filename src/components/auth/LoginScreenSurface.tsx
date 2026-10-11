import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import type { TextInputRef } from '@expo/ui';
import { LoginActionsSection } from './login/login-actions-section';
import { LoginAlternativeAuthSection } from './login/login-alternative-auth-section';
import { LoginCredentialsSection } from './login/login-credentials-section';
import { LoginAuthLayout } from './LoginAuthLayout';
import { LoginStage, loginHeroHeight } from './LoginStage';
import { CinemaThemeProvider } from '../../theme/cinema-theme';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

/** Login on the dark welcome stage: drawn logo and glow behind the native form. */
export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const passwordRef = useRef<TextInputRef>(null);
  const { width } = useWindowDimensions();

  return (
    <CinemaThemeProvider>
      <LoginStage>
        <LoginAuthLayout topSpacing={loginHeroHeight(width)}>
          <LoginCredentialsSection vm={vm} passwordRef={passwordRef} />
          <LoginActionsSection vm={vm} />
          {vm.showAppleSignIn || vm.showPasskeySignIn ? <LoginAlternativeAuthSection vm={vm} /> : null}
        </LoginAuthLayout>
      </LoginStage>
    </CinemaThemeProvider>
  );
}

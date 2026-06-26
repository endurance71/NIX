import { LoginScreenSurface } from '../../components/auth/LoginScreenSurface';
import { useLoginScreen } from '../../hooks/useLoginScreen';

export default function LoginScreen() {
  const vm = useLoginScreen();
  return <LoginScreenSurface vm={vm} />;
}

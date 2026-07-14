import { useTranslation } from 'react-i18next';
import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import { AuthBrandMark } from '../AuthBrandMark';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAuthContentWidth } from '../../ui/auth-content-width';
import { AUTH_LOGIN_HERO_INTERNAL_GAP } from '../../../theme/authLayout';

/** Minimal login hero: logo + tagline only. */
export function LoginHeroSection() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();

  return (
    <VStack
      alignment="center"
      spacing={AUTH_LOGIN_HERO_INTERNAL_GAP}
      modifiers={[frame({ width: contentWidth, alignment: 'center' })]}>
      <AuthBrandMark />
      <Text
        modifiers={[
          font({ textStyle: 'footnote' }),
          foregroundStyle(colors.secondaryLabel),
          multilineTextAlignment('center'),
          frame({ width: contentWidth, alignment: 'center' }),
        ]}>
        {t('auth.tagline')}
      </Text>
    </VStack>
  );
}

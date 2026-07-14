import type { PropsWithChildren } from 'react';
import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_LOGIN_FIELD_LABEL_GAP } from '../../theme/authLayout';

type AuthLabeledFieldProps = PropsWithChildren<{
  label: string;
}>;

/** iOS Settings-style label above a native auth field. */
export function AuthLabeledField({ label, children }: AuthLabeledFieldProps) {
  const { colors } = useAppTheme();

  return (
    <VStack alignment="leading" spacing={AUTH_LOGIN_FIELD_LABEL_GAP} modifiers={[frame({ maxWidth: Infinity })]}>
      <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(colors.secondaryLabel)]}>{label}</Text>
      {children}
    </VStack>
  );
}

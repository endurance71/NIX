import { View } from 'react-native';
import { RNHostView, VStack } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { getAuthPrimaryButtonWidth } from '../../theme/authLayout';
import { useAuthContentWidth } from './auth-content-width';
import { Button } from './button';

type AuthPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * The shared `Button` (primary, large) embedded in the SwiftUI auth stack: `RNHostView` needs an
 * explicit width, so the column width comes from the auth layout context.
 */
export function AuthPrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: AuthPrimaryButtonProps) {
  const contentWidth = useAuthContentWidth();
  const buttonWidth = getAuthPrimaryButtonWidth(contentWidth, loading);

  return (
    <VStack alignment="center" spacing={0} modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      <RNHostView matchContents>
        <View style={{ width: buttonWidth }}>
          <Button
            title={label}
            onPress={onPress}
            variant="primary"
            size="large"
            disabled={disabled}
            loading={loading}
            fullWidth
          />
        </View>
      </RNHostView>
    </VStack>
  );
}

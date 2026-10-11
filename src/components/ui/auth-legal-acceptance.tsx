import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RNHostView, VStack } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_LEGAL_CHECKBOX_HIT_SIZE,
  AUTH_LEGAL_CHECKBOX_VISUAL_SIZE,
  AUTH_LEGAL_CONTROL_MIN_HEIGHT,
} from '../../theme/authLayout';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useAuthContentWidth } from './auth-content-width';

type AuthLegalAcceptanceProps = {
  accepted: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
};

/**
 * React Native checkbox content must be hosted explicitly so SwiftUI measures
 * its wrapped legal text before laying out the following CTA.
 */
export function AuthLegalAcceptance({
  accepted,
  disabled = false,
  label,
  onPress,
  testID,
}: AuthLegalAcceptanceProps) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      <RNHostView matchContents>
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted, disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.row,
            { width: contentWidth },
            pressed && !disabled ? styles.pressed : null,
          ]}
          testID={testID}>
          <View style={styles.checkboxHitArea}>
            <View
              style={[
                styles.checkbox,
                { borderColor: colors.systemBlue },
                accepted ? { backgroundColor: colors.systemBlue } : null,
              ]}>
              {accepted ? <Text style={[styles.checkboxMark, { color: colors.onAccent }]}>✓</Text> : null}
            </View>
          </View>
          <Text style={[styles.label, { color: colors.secondaryLabel }]}>{label}</Text>
        </Pressable>
      </RNHostView>
    </VStack>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: AUTH_LEGAL_CONTROL_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxHitArea: {
    width: AUTH_LEGAL_CHECKBOX_HIT_SIZE,
    height: AUTH_LEGAL_CHECKBOX_HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: AUTH_LEGAL_CHECKBOX_VISUAL_SIZE,
    height: AUTH_LEGAL_CHECKBOX_VISUAL_SIZE,
    borderWidth: 1,
    borderRadius: radius.xs,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  label: {
    flex: 1,
    minHeight: AUTH_LEGAL_CONTROL_MIN_HEIGHT,
    paddingTop: 3,
    paddingBottom: 4,
    paddingLeft: 6,
    ...typography.footnote,
  },
  pressed: {
    opacity: 0.7,
  },
});

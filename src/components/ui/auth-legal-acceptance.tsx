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

// The visual box sits flush with the column's leading edge (like the links below it), and the
// label's first line is centred on the box; the 44 pt hit area still surrounds the box.
const HIT_INSET = (AUTH_LEGAL_CHECKBOX_HIT_SIZE - AUTH_LEGAL_CHECKBOX_VISUAL_SIZE) / 2;
const LABEL_FIRST_LINE_INSET = (AUTH_LEGAL_CHECKBOX_HIT_SIZE - typography.footnote.lineHeight) / 2;

const styles = StyleSheet.create({
  row: {
    minHeight: AUTH_LEGAL_CONTROL_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxHitArea: {
    marginLeft: -HIT_INSET,
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
    paddingTop: LABEL_FIRST_LINE_INSET,
    paddingBottom: LABEL_FIRST_LINE_INSET,
    paddingLeft: 4,
    ...typography.footnote,
  },
  pressed: {
    opacity: 0.7,
  },
});

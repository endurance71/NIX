import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { typography } from '../../theme/typography';

export function NativeInput(props: TextInputProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.wrapper, { borderColor: colors.separator, backgroundColor: colors.secondarySystemBackground }]}>
      <TextInput
        {...props}
        style={[styles.input, { color: colors.label }, props.style]}
        placeholderTextColor={props.placeholderTextColor ?? colors.tertiaryLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 50,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  input: {
    ...typography.callout,
    padding: 0,
  },
});

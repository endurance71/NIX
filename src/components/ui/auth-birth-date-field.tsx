import { DatePicker } from '@expo/ui/swift-ui';
import { datePickerStyle, disabled as disabledModifier, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';

type AuthBirthDateFieldProps = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  disabled?: boolean;
  testID?: string;
};

// Any plausible birth year; the end is today, so the age check (not the picker) decides who may
// continue and the picker does not hint at the minimum age.
const EARLIEST_BIRTH_DATE = new Date(1900, 0, 1);

/** Native iOS date row ("Date of birth  [Jan 1, 2000]") that opens the system calendar. */
export function AuthBirthDateField({ label, value, onChange, disabled = false, testID }: AuthBirthDateFieldProps) {
  const { colors } = useAppTheme();

  return (
    <DatePicker
      title={label}
      selection={value ?? undefined}
      range={{ start: EARLIEST_BIRTH_DATE, end: new Date() }}
      displayedComponents={['date']}
      onDateChange={onChange}
      modifiers={[
        datePickerStyle('compact'),
        tint(colors.accent),
        frame({ maxWidth: Infinity }),
        disabledModifier(disabled),
      ]}
      testID={testID}
    />
  );
}

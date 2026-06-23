import { BottomSheet, Button, Column, Text } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { selection } from '../../lib/haptics';
import {
  formatNixViewDurationLabel,
  type NixViewDurationSec,
} from '../../lib/nixViewDuration';

type DurationPickerSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  selectedDurationSec: NixViewDurationSec;
  choices: readonly NixViewDurationSec[];
  onSelect: (sec: NixViewDurationSec) => void;
};

export function DurationPickerSheet({
  isPresented,
  onDismiss,
  selectedDurationSec,
  choices,
  onSelect,
}: DurationPickerSheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet isPresented={isPresented} onDismiss={onDismiss} snapPoints={['half']}>
      <Column spacing={8} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text textStyle={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary }}>
          Czas wyświetlania
        </Text>
        <Text textStyle={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
          Jak długo zdjęcie będzie widoczne u odbiorcy po otwarciu.
        </Text>
        {choices.map((sec) => (
          <Button
            key={sec}
            label={`${formatNixViewDurationLabel(sec)}${sec === selectedDurationSec ? ' ✓' : ''}`}
            variant={sec === selectedDurationSec ? 'filled' : 'text'}
            onPress={() => {
              selection();
              onSelect(sec);
              onDismiss();
            }}
          />
        ))}
        <Button label="Anuluj" variant="text" onPress={onDismiss} />
      </Column>
    </BottomSheet>
  );
}

import { View } from 'react-native';
import { MyProfileQrCard } from '../friend/my-profile-qr-card';
import type { ThemeColors } from '../../theme/colors';

type Props = {
  colors: ThemeColors;
  qrPayload: string | null;
  avatarSignedUrl: string | null;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  initialLetter: string;
  panelWidth?: number;
};

export function ProfileQrAvatarSection({
  colors,
  qrPayload,
  avatarSignedUrl,
  avatarStoragePath,
  avatarEmoji,
  initialLetter,
  panelWidth,
}: Props) {
  return (
    <View
      style={[
        styles.host,
        {
          width: panelWidth,
          backgroundColor: colors.tertiarySystemBackground,
        },
      ]}>
      <MyProfileQrCard
        payload={qrPayload}
        colors={colors}
        centerOverlayRatio={0.3}
        avatarUrl={avatarSignedUrl}
        avatarStoragePath={avatarStoragePath}
        avatarEmoji={avatarEmoji}
        fallbackInitial={initialLetter}
      />
    </View>
  );
}

const styles = {
  host: {
    height: 312,
    minHeight: 312,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
} as const;

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
};

export function ProfileQrAvatarSection({
  colors,
  qrPayload,
  avatarSignedUrl,
  avatarStoragePath,
  avatarEmoji,
  initialLetter,
}: Props) {
  return (
    <View>
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

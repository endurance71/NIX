import { Pressable, Text as RNText, View } from 'react-native';
import { router } from 'expo-router';
import { RNHostView } from '@expo/ui';
import { MyProfileQrCard } from '../friend/my-profile-qr-card';
import type { ThemeColors } from '../../theme/colors';
import type { TextStyle, ViewStyle } from 'react-native';

type Props = {
  colors: ThemeColors;
  qrPayload: string | null;
  avatarSignedUrl: string | null;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  initialLetter: string;
  avatarBusy: boolean;
  hasAvatar: boolean;
  styles: {
    avatarActions: ViewStyle;
    avatarLink: ViewStyle;
    avatarLinkPressed: ViewStyle;
    avatarLinkText: TextStyle;
  };
  onPickAvatarPhoto: () => void;
};

export function ProfileQrAvatarSection({
  colors,
  qrPayload,
  avatarSignedUrl,
  avatarStoragePath,
  avatarEmoji,
  initialLetter,
  avatarBusy,
  hasAvatar,
  styles,
  onPickAvatarPhoto,
}: Props) {
  return (
    <>
      <RNHostView matchContents>
        <MyProfileQrCard
          payload={qrPayload}
          colors={colors}
          centerOverlayRatio={0.3}
          avatarUrl={avatarSignedUrl}
          avatarStoragePath={avatarStoragePath}
          avatarEmoji={avatarEmoji}
          fallbackInitial={initialLetter}
        />
      </RNHostView>
      <RNHostView matchContents>
        <View style={styles.avatarActions}>
          <Pressable
            onPress={onPickAvatarPhoto}
            disabled={avatarBusy}
            style={({ pressed }) => [styles.avatarLink, pressed && styles.avatarLinkPressed]}>
            <RNText style={[styles.avatarLinkText, { color: colors.accent }]}>
              {avatarBusy ? 'Przetwarzanie…' : 'Zdjęcie z biblioteki'}
            </RNText>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/profile/remove-avatar',
                params: {
                  avatarUrl: avatarSignedUrl ?? undefined,
                  avatarStoragePath: avatarStoragePath ?? undefined,
                  avatarEmoji: avatarEmoji ?? undefined,
                  fallbackInitial: initialLetter,
                },
              })
            }
            disabled={avatarBusy || !hasAvatar}
            style={({ pressed }) => [styles.avatarLink, pressed && styles.avatarLinkPressed]}>
            <RNText style={[styles.avatarLinkText, { color: hasAvatar ? colors.destructive : colors.tertiaryLabel }]}>
              Usuń awatar
            </RNText>
          </Pressable>
        </View>
      </RNHostView>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { useProfileQrPayload } from '../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../components/friend/my-profile-qr-card';
import { useAuth } from '../hooks/useAuth';
import { createSignedAvatarUrl } from '../services/avatarService';
import { CurrentUserProfileRow, getCurrentUserProfile } from '../services/profileService';
import { Host, Form, Section, Text, Button, RNHostView } from '@expo/ui/swift-ui';
import { foregroundStyle, font, padding } from '@expo/ui/swift-ui/modifiers';

export default function FriendMyCodeScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const payload = useProfileQrPayload();
  const [profileRow, setProfileRow] = useState<CurrentUserProfileRow | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  const fallbackInitial = (profileRow?.username ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    getCurrentUserProfile()
      .then((profile) => {
        if (!cancelled) {
          setProfileRow(profile);
        }
      })
      .catch((err) => {
        console.error('Nie udało się pobrać profilu dla QR', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const path = profileRow?.avatar_storage_path;
    if (!path) {
      setAvatarSignedUrl(null);
      return () => {
        cancelled = true;
      };
    }
    createSignedAvatarUrl(path)
      .then((url) => {
        if (!cancelled) {
          setAvatarSignedUrl(url);
        }
      })
      .catch((err) => {
        console.error('Nie udało się wygenerować signed URL avatara', err);
        if (!cancelled) {
          setAvatarSignedUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileRow?.avatar_storage_path]);

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Mój kod QR">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            To jest stały kod QR Twojego profilu. Znajomy może go zeskanować, aby wysłać zaproszenie.
          </Text>
          <RNHostView matchContents>
            <MyProfileQrCard
              payload={payload}
              colors={colors}
              centerOverlayRatio={0.3}
              avatarUrl={avatarSignedUrl}
              avatarStoragePath={profileRow?.avatar_storage_path ?? null}
              avatarEmoji={profileRow?.avatar_emoji}
              fallbackInitial={fallbackInitial}
            />
          </RNHostView>
          <Button label="Skanuj QR" onPress={() => router.push('/friend-scan-qr')} />
        </Section>
      </Form>
    </Host>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
  });

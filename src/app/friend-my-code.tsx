import { useEffect, useReducer } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppRnHostView } from '../components/ui/app-rn-host-view';
import { useAppTheme } from '../hooks/useAppTheme';
import { useProfileQrPayload } from '../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../components/friend/my-profile-qr-card';
import { useAuth } from '../hooks/useAuth';
import { createSignedAvatarUrl } from '../services/avatarService';
import { CurrentUserProfileRow, getCurrentUserProfile } from '../services/profileService';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { typography } from '../theme/typography';

export default function FriendMyCodeScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('tabStackList');
  const { user } = useAuth();
  const payload = useProfileQrPayload();
  const [state, dispatch] = useReducer(
    (
      current: { profileRow: CurrentUserProfileRow | null; avatarSignedUrl: string | null },
      action:
        | { type: 'profile_loaded'; profileRow: CurrentUserProfileRow | null }
        | { type: 'avatar_loaded'; avatarSignedUrl: string | null }
    ) => {
      switch (action.type) {
        case 'profile_loaded':
          return { ...current, profileRow: action.profileRow };
        case 'avatar_loaded':
          return { ...current, avatarSignedUrl: action.avatarSignedUrl };
        default:
          return current;
      }
    },
    { profileRow: null, avatarSignedUrl: null }
  );
  const { profileRow, avatarSignedUrl } = state;

  const fallbackInitial = (profileRow?.username ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    getCurrentUserProfile()
      .then((profile) => {
        if (!cancelled) dispatch({ type: 'profile_loaded', profileRow: profile });
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
    void (async () => {
      if (!path) {
        if (!cancelled) dispatch({ type: 'avatar_loaded', avatarSignedUrl: null });
        return;
      }
      try {
        const url = await createSignedAvatarUrl(path);
        if (!cancelled) dispatch({ type: 'avatar_loaded', avatarSignedUrl: url });
      } catch (err) {
        console.error('Nie udało się wygenerować signed URL avatara', err);
        if (!cancelled) dispatch({ type: 'avatar_loaded', avatarSignedUrl: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileRow?.avatar_storage_path]);

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: colors.secondaryLabel }]}>
          To jest stały kod QR Twojego profilu. Znajomy może go zeskanować, aby wysłać zaproszenie.
        </Text>
        <View style={[styles.qrPanel, { backgroundColor: colors.secondarySystemBackground }]}>
          <AppRnHostView matchContents>
            <MyProfileQrCard
              payload={payload}
              colors={colors}
              centerOverlayRatio={0.3}
              avatarUrl={avatarSignedUrl}
              avatarStoragePath={profileRow?.avatar_storage_path ?? null}
              avatarEmoji={profileRow?.avatar_emoji}
              fallbackInitial={fallbackInitial}
            />
          </AppRnHostView>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/friend-scan-qr')}
          style={({ pressed }) => [
            styles.scanButton,
            { backgroundColor: colors.accent, opacity: pressed ? 0.72 : 1 },
          ]}>
          <Text style={styles.scanButtonText}>Skanuj QR</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 18,
  },
  qrPanel: {
    minHeight: 312,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingVertical: 26,
  },
  scanButton: {
    alignSelf: 'center',
    marginTop: 20,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 22,
    paddingHorizontal: 20,
  },
  scanButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

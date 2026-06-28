import { useEffect, useReducer } from 'react';
import { Link, router } from 'expo-router';
import { Button } from '@expo/ui';
import { AppRnHostView } from '../components/ui/app-rn-host-view';
import { useAppTheme } from '../hooks/useAppTheme';
import { useProfileQrPayload } from '../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../components/friend/my-profile-qr-card';
import { useAuth } from '../hooks/useAuth';
import { createSignedAvatarUrl } from '../services/avatarService';
import { CurrentUserProfileRow, getCurrentUserProfile } from '../services/profileService';
import {
  AuthFormLayout,
  AuthFormSection,
  AuthSecondaryText,
} from '../components/ui/auth-form-layout';

export default function FriendMyCodeScreen() {
  const { colors } = useAppTheme();
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
    <AuthFormLayout>
      <AuthFormSection title="Mój kod QR">
        <AuthSecondaryText>
          To jest stały kod QR Twojego profilu. Znajomy może go zeskanować, aby wysłać zaproszenie.
        </AuthSecondaryText>
        <Link.AppleZoomTarget>
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
        </Link.AppleZoomTarget>
        <Button label="Skanuj QR" onPress={() => router.push('/friend-scan-qr')} />
      </AuthFormSection>
    </AuthFormLayout>
  );
}

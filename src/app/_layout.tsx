import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { View, Text, Pressable, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getCurrentUserProfile } from '../services/profileService';
import { DeepLinkHandler } from '../lib/deepLink';
import { useAppTheme } from '../hooks/useAppTheme';
import { AppThemeProvider } from '../theme/theme-context';
import { APP_FONT_FAMILY } from '../theme/typography';
import { createAppQueryClient } from '../lib/queryClient';
import { bindReactQueryAppLifecycle } from '../lib/reactQueryNetwork';
import { bindSupabaseAuthLifecycle } from '../lib/supabase';
import { ToastProvider } from 'react-native-pretty-toast';
import { VideoDraftProvider } from '../context/VideoDraftContext';
import { PhotoDraftProvider } from '../context/PhotoDraftContext';
import { initMonitoring } from '../lib/monitoring';
import { configureMediaCache } from '../lib/mediaCache';
import { configureForPlayback } from '../lib/audioSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { AppRealtimeSync } from '../components/sync/AppRealtimeSync';
import { queryKeys } from '../lib/queryKeys';
import { resolveBootstrapState } from '../lib/profileGate';
import { hasCurrentAgeAttestation } from '../services/safetyService';
import { AGE_POLICY_VERSION } from '../lib/ageGate';
import {
  clearProfileBootstrapSnapshot,
  readProfileBootstrapSnapshot,
  writeProfileBootstrapSnapshot,
} from '../lib/profileBootstrapSnapshot';
import { PushNotificationsProvider } from '../context/PushNotificationsProvider';
import { UploadQueueProvider } from '../context/UploadQueueProvider';
import { getPendingFriendInviteToken } from '../lib/pendingFriendInvite';
import { TextOutboxSync } from '../components/sync/TextOutboxSync';
import { AppInstallationSync } from '../components/sync/AppInstallationSync';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { trackEvent } from '../lib/telemetry';
import { OfflineCacheProvider, useOfflineCache } from '../context/OfflineCacheProvider';
import type { Session } from '@supabase/supabase-js';
import type { TFunction } from 'i18next';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Catch and ignore in environments where splash screen autohide prevention is unavailable.
});

// Initialize monitoring at module load (runs once).
initMonitoring();

function RootLayout() {
  const [queryClient] = useState(() => createAppQueryClient());

  useEffect(() => bindReactQueryAppLifecycle(), []);
  useEffect(() => bindSupabaseAuthLifecycle(), []);
  useEffect(() => configureMediaCache(), []);
  useEffect(() => {
    void configureForPlayback().catch((error) => {
      console.warn('Audio session bootstrap failed', error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider maxQueue={3} defaultConfig={{ duration: 4000 }}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AppThemeProvider>
                <OfflineCacheProvider>
                  <VideoDraftProvider>
                    <PhotoDraftProvider>
                      <UploadQueueProvider>
                        <DeepLinkHandler />
                        <RootNavigator />
                      </UploadQueueProvider>
                    </PhotoDraftProvider>
                  </VideoDraftProvider>
                </OfflineCacheProvider>
              </AppThemeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;

type AppColors = ReturnType<typeof useAppTheme>['colors'];
type AppStatusBarStyle = ReturnType<typeof useAppTheme>['statusBarStyle'];

function BootstrapLoadingScreen({ statusBarStyle }: { statusBarStyle: AppStatusBarStyle }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
      <StatusBar style={statusBarStyle} hidden={false} />
    </View>
  );
}

function BootstrapMessageScreen({
  colors,
  statusBarStyle,
  title,
  hint,
  retryLabel,
  onRetry,
  secondaryLabel,
  onSecondary,
}: {
  colors: AppColors;
  statusBarStyle: AppStatusBarStyle;
  title: string;
  hint: string;
  retryLabel: string;
  onRetry: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, backgroundColor: colors.background }}>
      <StatusBar style={statusBarStyle} hidden={false} />
      <Text style={{ color: colors.label, fontSize: 22, fontWeight: '700', textAlign: 'center', fontFamily: APP_FONT_FAMILY }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', fontFamily: APP_FONT_FAMILY }}>
        {hint}
      </Text>
      <Pressable
        style={{ marginTop: 24, backgroundColor: colors.buttonPrimaryBg, padding: 14, borderRadius: 12 }}
        onPress={onRetry}
      >
        <Text style={{ color: colors.buttonPrimaryText, textAlign: 'center', fontWeight: '700', fontFamily: APP_FONT_FAMILY }}>
          {retryLabel}
        </Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable style={{ marginTop: 12, padding: 14 }} onPress={onSecondary}>
          <Text style={{ color: colors.accent, textAlign: 'center', fontFamily: APP_FONT_FAMILY }}>
            {secondaryLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AppStack({
  session,
  canUseNetworkSession,
  needsOnboarding,
  colors,
  statusBarStyle,
  t,
}: {
  session: Session | null;
  canUseNetworkSession: boolean;
  needsOnboarding: boolean;
  colors: AppColors;
  statusBarStyle: AppStatusBarStyle;
  t: TFunction;
}) {
  const content = (
    <>
      <StatusBar style={statusBarStyle} hidden={false} />
      {session && canUseNetworkSession ? <AppRealtimeSync userId={session.user.id} /> : null}
      {session && canUseNetworkSession ? <TextOutboxSync userId={session.user.id} /> : null}
      {session && canUseNetworkSession && iosRoadmapFeatures.accountData ? <AppInstallationSync /> : null}
      <Stack
        initialRouteName={session && !needsOnboarding ? '(tabs)' : '(auth)'}
        screenOptions={{
          headerShown: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.accent,
          headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
          headerLargeTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="preview" options={{ presentation: 'card', headerShown: false, contentStyle: { backgroundColor: '#000000' } }} />
        <Stack.Screen name="viewer" options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }} />
        <Stack.Screen
          name="friend-my-code"
          options={{
            presentation: 'card',
            headerShown: true,
            title: t('profile.myQrCode'),
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: colors.accent,
            headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="friend-scan-qr"
          options={{
            presentation: 'card',
            headerShown: true,
            title: t('root.qrScan'),
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: colors.cameraControlTint,
            headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.cameraControlTint },
          }}
        />
        <Stack.Screen name="friend-invite" options={{ presentation: 'card', headerShown: true, title: t('root.invite') }} />
        <Stack.Screen
          name="chat/[peerId]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
            headerBackground: () => null,
            headerTintColor: colors.accent,
            contentStyle: { backgroundColor: colors.systemBackground },
          }}
        />
        <Stack.Screen
          name="new-chat"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
            sheetAllowedDetents: [0.55, 0.9],
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="send-to"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
            sheetAllowedDetents: [0.55, 0.9],
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </>
  );

  if (!session || !canUseNetworkSession || Platform.OS !== 'ios') return content;
  return (
    <PushNotificationsProvider userId={session.user.id} canNavigate={!needsOnboarding}>
      {content}
    </PushNotificationsProvider>
  );
}

function RootNavigator() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const {
    session,
    status: authStatus,
    lastBootstrapResult,
    canUseNetworkSession,
    signOut,
    retryBootstrap,
  } = useAuth();
  const { isHydrated: offlineCacheHydrated } = useOfflineCache();
  const userId = session?.user.id ?? null;
  const segments = useSegments() as string[];
  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
    isSuccess: profileSuccess,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: queryKeys.currentUserProfile(userId),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
    retry: 2,
  });
  const {
    data: ageAttested,
    isPending: ageAttestationPending,
    isError: ageAttestationError,
    isSuccess: ageAttestationSuccess,
    refetch: refetchAgeAttestation,
  } = useQuery({
    queryKey: queryKeys.currentAgeAttestation(userId, AGE_POLICY_VERSION),
    queryFn: hasCurrentAgeAttestation,
    enabled: canUseNetworkSession,
    retry: 2,
  });
  const {
    data: bootstrapSnapshot,
    isPending: snapshotPending,
    isError: snapshotError,
    refetch: refetchSnapshot,
  } = useQuery({
    queryKey: ['profileBootstrapSnapshot', userId],
    queryFn: () => readProfileBootstrapSnapshot(userId!),
    enabled: !!userId,
    staleTime: Infinity,
    retry: false,
    networkMode: 'always',
  });
  const bootstrap = resolveBootstrapState({
    authStatus,
    hasSession: !!session,
    profile,
    profilePending: Boolean(canUseNetworkSession && profilePending),
    profileError,
    ageAttested,
    agePending: Boolean(canUseNetworkSession && ageAttestationPending),
    ageError: ageAttestationError,
    snapshotPending: Boolean(session && snapshotPending),
    snapshotError,
    hasValidSnapshot: bootstrapSnapshot?.userId === userId,
  });
  const bootstrapFailureStage = lastBootstrapResult === 'storage_error'
    ? 'auth_storage'
    : snapshotError
      ? 'profile_snapshot'
      : profileError
        ? 'profile'
        : ageAttestationError
          ? 'age_attestation'
          : bootstrap.status === 'recoverableError'
            ? 'auth_session'
            : null;
  const needsOnboarding = bootstrap.status === 'needsOnboarding';
  const appReady = bootstrap.status !== 'loading' && (!session || offlineCacheHydrated);
  const inAuthGroup = segments[0] === '(auth)';
  const onResetPasswordScreen = segments[1] === 'reset-password';

  useEffect(() => {
    if (bootstrap.status !== 'loading') {
      trackEvent('bootstrap_resolution', {
        resolution: bootstrap.status,
        failure_stage: bootstrapFailureStage,
      });
    }
  }, [bootstrap.status, bootstrapFailureStage]);

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  useEffect(() => {
    if (!userId || !profileSuccess || !ageAttestationSuccess) return;
    if (profile?.username && ageAttested === true) {
      void writeProfileBootstrapSnapshot(userId, profile).then((snapshot) => {
        queryClient.setQueryData(['profileBootstrapSnapshot', userId], snapshot);
      });
    } else {
      void clearProfileBootstrapSnapshot(userId).then(() => {
        queryClient.setQueryData(['profileBootstrapSnapshot', userId], null);
      });
    }
  }, [ageAttestationSuccess, ageAttested, profile, profileSuccess, queryClient, userId]);

  useEffect(() => {
    if (!userId || canUseNetworkSession || !bootstrapSnapshot?.profile) return;
    const profileKey = queryKeys.currentUserProfile(userId);
    if (queryClient.getQueryData(profileKey) === undefined) {
      queryClient.setQueryData(profileKey, bootstrapSnapshot.profile);
    }
  }, [bootstrapSnapshot, canUseNetworkSession, queryClient, userId]);

  useEffect(() => {
    if (!appReady || bootstrap.status === 'recoverableError') return;

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (!session) return;

    if (needsOnboarding && segments[1] !== 'onboarding' && !onResetPasswordScreen) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (!needsOnboarding && inAuthGroup && !onResetPasswordScreen) {
      router.replace('/(tabs)');
    }
  }, [appReady, bootstrap.status, inAuthGroup, needsOnboarding, onResetPasswordScreen, segments, session]);

  useEffect(() => {
    if (
      !iosRoadmapFeatures.shareInvites ||
      !appReady || bootstrap.status === 'recoverableError' ||
      !session || !canUseNetworkSession ||
      needsOnboarding
    ) return;
    let cancelled = false;
    void getPendingFriendInviteToken().then((token) => {
      if (cancelled || !token || segments[0] === 'friend-invite') return;
      router.push({ pathname: '/friend-invite', params: { token } });
    });
    return () => {
      cancelled = true;
    };
  }, [appReady, bootstrap.status, canUseNetworkSession, needsOnboarding, segments, session]);

  if (!appReady) {
    return <BootstrapLoadingScreen statusBarStyle={statusBarStyle} />;
  }

  if (bootstrap.status === 'recoverableError') {
    const storageFailure = lastBootstrapResult === 'storage_error';
    const failureTitle = storageFailure
      ? 'root.sessionStorageFailed'
      : snapshotError
        ? 'root.snapshotReadFailed'
        : profileError
          ? 'root.profileVerificationFailed'
          : ageAttestationError
            ? 'root.ageVerificationFailed'
            : 'root.accountVerificationFailed';
    const failureHint = storageFailure
      ? 'root.sessionStorageHint'
      : snapshotError
        ? 'root.snapshotReadHint'
        : profileError
          ? 'root.profileVerificationHint'
          : ageAttestationError
            ? 'root.ageVerificationHint'
            : 'root.accountVerificationHint';
    return (
      <BootstrapMessageScreen
        colors={colors}
        statusBarStyle={statusBarStyle}
        title={t(failureTitle)}
        hint={t(failureHint)}
        retryLabel={t('common.retry')}
        onRetry={() => void (async () => {
            const result = await retryBootstrap();
            if (result.category !== 'online') return;
            await Promise.all([refetchProfile(), refetchAgeAttestation(), refetchSnapshot()]);
          })()}
        secondaryLabel={t('root.useAnotherAccount')}
        onSecondary={() => void (async () => {
            await signOut();
            router.replace('/(auth)/login');
          })()}
      />
    );
  }

  if (bootstrap.status === 'offlineNeedsVerification') {
    return (
      <BootstrapMessageScreen
        colors={colors}
        statusBarStyle={statusBarStyle}
        title={t('root.offlineVerificationRequired')}
        hint={t('root.offlineVerificationHint')}
        retryLabel={t('common.retry')}
        onRetry={() => void retryBootstrap()}
      />
    );
  }
  return (
    <AppStack
      session={session}
      canUseNetworkSession={canUseNetworkSession}
      needsOnboarding={needsOnboarding}
      colors={colors}
      statusBarStyle={statusBarStyle}
      t={t}
    />
  );
}

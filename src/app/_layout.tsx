import { resolveBootstrapFailure, resolveBootstrapRedirect } from '../lib/bootstrapPresentation';
import { Stack, router, useNavigationContainerRef, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUserProfile } from '../services/profileService';
import { DeepLinkHandler } from '../lib/deepLink';
import { useAppTheme } from '../hooks/useAppTheme';
import { AppThemeProvider, useAccentPreferenceReady } from '../theme/theme-context';
import { APP_FONT_FAMILY, typography } from '../theme/typography';
import { AppIcon } from '../components/ui/app-icon';
import { Button } from '../components/ui/button';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { createAppQueryClient } from '../lib/queryClient';
import { bindReactQueryAppLifecycle } from '../lib/reactQueryNetwork';
import { bindSupabaseAuthLifecycle } from '../lib/supabase';
import { AppNotificationsProvider } from '../context/AppNotificationsProvider';
import { VideoDraftProvider } from '../context/VideoDraftContext';
import { PhotoDraftProvider } from '../context/PhotoDraftContext';
import { initMonitoring } from '../lib/monitoring';
import { configureMediaCache } from '../lib/mediaCache';
import { configureForPlayback } from '../lib/audioSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { AppRealtimeSync } from '../components/sync/AppRealtimeSync';
import { queryKeys } from '../lib/queryKeys';
import { resolveBootstrapState, type BootstrapResolution } from '../lib/profileGate';
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
import { SOFT_SCROLL_EDGE_EFFECTS } from '../theme/scrollEdge';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Catch and ignore in environments where splash screen autohide prevention is unavailable.
});
// Fade from the indigo launch tile into the app instead of cutting.
SplashScreen.setOptions({ duration: 250, fade: true });

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
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppThemeProvider>
              <AppNotificationsProvider>
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
              </AppNotificationsProvider>
            </AppThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;

type AppColors = ReturnType<typeof useAppTheme>['colors'];
type AppStatusBarStyle = ReturnType<typeof useAppTheme>['statusBarStyle'];

/** Continues the launch screen (same tile colour as the splash) while bootstrap finishes. */
function BootstrapLoadingScreen({ backgroundColor }: { backgroundColor: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor }}>
      <StatusBar style="light" hidden={false} />
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
    <View style={[bootstrapMessageStyles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={statusBarStyle} hidden={false} />
      <Text selectable style={[bootstrapMessageStyles.title, { color: colors.label }]}>
        {title}
      </Text>
      <Text selectable style={[bootstrapMessageStyles.hint, { color: colors.textMuted }]}>
        {hint}
      </Text>
      <Button
        title={retryLabel}
        onPress={onRetry}
        size="large"
        fullWidth
        style={bootstrapMessageStyles.retry}
      />
      {secondaryLabel && onSecondary ? (
        <Button
          title={secondaryLabel}
          onPress={onSecondary}
          variant="tertiary"
          fullWidth
          style={bootstrapMessageStyles.secondary}
        />
      ) : null}
    </View>
  );
}

type BootstrapMessage = {
  title: string;
  hint: string;
  retryLabel: string;
  onRetry: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * Same message as `BootstrapMessageScreen`, shown over a Stack that is already mounted. Replacing
 * the Stack would drop the whole navigation history (open chat, composer draft, camera).
 */
function BootstrapMessageBanner({
  colors,
  title,
  hint,
  retryLabel,
  onRetry,
  secondaryLabel,
  onSecondary,
}: BootstrapMessage & { colors: AppColors }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="alert"
      style={[
        bannerStyles.container,
        {
          top: insets.top + 8,
          backgroundColor: colors.secondarySystemBackground,
          borderColor: colors.separator,
        },
      ]}
    >
      <View style={bannerStyles.header}>
        <AppIcon name="warning" size={16} color={colors.accentText} />
        <Text maxFontSizeMultiplier={1.4} style={[bannerStyles.title, { color: colors.label }]}>
          {title}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={[bannerStyles.hint, { color: colors.textMuted }]}>
        {hint}
      </Text>
      <View style={bannerStyles.actions}>
        {secondaryLabel && onSecondary ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onSecondary}>
            <Text maxFontSizeMultiplier={1.4} style={[bannerStyles.action, { color: colors.textMuted }]}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
          <Text maxFontSizeMultiplier={1.4} style={[bannerStyles.action, { color: colors.accentText }]}>
            {retryLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const bootstrapMessageStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
  },
  hint: {
    ...typography.subheadline,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  retry: {
    marginTop: spacing.xxl,
  },
  secondary: {
    marginTop: spacing.sm,
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.headline,
    flex: 1,
  },
  hint: {
    ...typography.footnote,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    marginTop: spacing.xxs,
  },
  action: {
    ...typography.callout,
    fontWeight: '600',
  },
});

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
          headerTintColor: colors.accentText,
          headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
          headerLargeTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
          scrollEdgeEffects: SOFT_SCROLL_EDGE_EFFECTS,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="preview" options={{ presentation: 'card', headerShown: false, contentStyle: { backgroundColor: colors.cinemaBackground } }} />
        {/*
          Full-screen media over the current screen: fades in/out, and the viewer draws its own
          cinema backdrop so swipe-down to dismiss can reveal the screen underneath.
        */}
        <Stack.Screen
          name="viewer"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        {/* The welcome tour: first launch, or every launch with the owner's test switch. */}
        <Stack.Screen
          name="welcome"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: colors.cinemaBackground },
          }}
        />
        {/* Profile → Memories: one of the user's own sent NiXes, full screen (no view acks). */}
        <Stack.Screen
          name="memory-viewer"
          options={{
            // Pushed, not presented: the zoom from the Memories cell (Link.AppleZoom) is set up
            // after the screen mounts, which a modal presentation has already outrun.
            headerShown: true,
            headerTransparent: true,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.cinemaBackground },
          }}
        />
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
            headerTintColor: colors.accentText,
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
            headerTintColor: colors.accentText,
            contentStyle: { backgroundColor: colors.systemBackground },
          }}
        />
        <Stack.Screen
          name="friend/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: colors.accentText,
            headerTitleStyle: { color: colors.label },
            contentStyle: { backgroundColor: colors.background },
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
        <Stack.Screen
          name="forward-message"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
            sheetAllowedDetents: [0.6, 0.9],
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </>
  );

  return (
    <PushNotificationsProvider
      userId={session?.user.id ?? null}
      enabled={Boolean(session) && canUseNetworkSession}
      canNavigate={!needsOnboarding}
    >
      {content}
    </PushNotificationsProvider>
  );
}

function useRootBootstrap({
  userId,
  canUseNetworkSession,
  authStatus,
  session,
  lastBootstrapResult,
}: {
  userId: string | null;
  canUseNetworkSession: boolean;
  authStatus: ReturnType<typeof useAuth>['status'];
  session: ReturnType<typeof useAuth>['session'];
  lastBootstrapResult: ReturnType<typeof useAuth>['lastBootstrapResult'];
}) {
  const queryClient = useQueryClient();
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
    // A valid snapshot already opens the app; a failure is shown instead of retrying for seconds.
    retry: 1,
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
    retry: 1,
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
  const bootstrapFailure = resolveBootstrapFailure({
    storageError: lastBootstrapResult === 'storage_error',
    snapshotError,
    profileError,
    ageError: ageAttestationError,
    status: bootstrap.status,
  });
  const bootstrapFailureStage = bootstrapFailure.stage;
  useEffect(() => {
    if (!userId || !profileSuccess || !ageAttestationSuccess) return;
    if (profile?.username && ageAttested === true) {
      void writeProfileBootstrapSnapshot(userId, profile).then((snapshot) => {
        queryClient.setQueryData(['profileBootstrapSnapshot', userId], snapshot);
      }).catch((error) => {
        // The previous snapshot (if any) stays valid; the next verified start retries the write.
        console.warn('Profile bootstrap snapshot write failed', error);
      });
    } else {
      void clearProfileBootstrapSnapshot(userId).then(() => {
        queryClient.setQueryData(['profileBootstrapSnapshot', userId], null);
      }).catch((error) => {
        console.warn('Profile bootstrap snapshot cleanup failed', error);
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

  return {
    bootstrap,
    bootstrapFailure,
    bootstrapFailureStage,
    refetchProfile,
    refetchAgeAttestation,
    refetchSnapshot,
  };
}

/**
 * Online, the network refreshes everything anyway and hydration never overwrites newer data, so
 * only an offline start waits for the disk cache. Once the Stack is mounted for an account it
 * stays mounted: a later retry (loading), auth error or verification prompt is shown over it
 * instead of resetting navigation.
 */
function useRootStackVisibility({
  bootstrapStatus,
  sessionUserId,
  canUseNetworkSession,
  offlineCacheHydrated,
}: {
  bootstrapStatus: BootstrapResolution['status'];
  sessionUserId: string | null;
  canUseNetworkSession: boolean;
  offlineCacheHydrated: boolean;
}) {
  const appReady = bootstrapStatus !== 'loading'
    && (!sessionUserId || canUseNetworkSession || offlineCacheHydrated);
  const blockingStatus = bootstrapStatus === 'recoverableError'
    || bootstrapStatus === 'offlineNeedsVerification';
  const [mountedStackOwner, setMountedStackOwner] = useState<string | null | undefined>(undefined);
  const keepStackMounted = mountedStackOwner !== undefined && mountedStackOwner === sessionUserId;
  const showStack = keepStackMounted || (appReady && !blockingStatus);
  if (showStack && !keepStackMounted) setMountedStackOwner(sessionUserId);
  return { appReady, blockingStatus, showStack };
}

function usePendingFriendInviteRedirect(enabled: boolean, segments: string[]) {
  useEffect(() => {
    if (!iosRoadmapFeatures.shareInvites || !enabled) return;
    let cancelled = false;
    void getPendingFriendInviteToken().then((token) => {
      if (cancelled || !token || segments[0] === 'friend-invite') return;
      router.push({ pathname: '/friend-invite', params: { token } });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, segments]);
}

/** The account the tour was opened for since its last sign-in; cleared on sign-out. */
let welcomePresentedFor: string | null = null;

/**
 * Sign in first, then the welcome tour: it opens on the tabs after every sign-in or sign-up (not
 * for a session restored at launch), so signing out and back in shows it again. Not over the
 * post-signup profile step, and only once the redirects are done.
 */
function useWelcomePresentation(enabled: boolean, segments: string[], userId: string | null, signedInNow: boolean) {
  useEffect(() => {
    if (!userId) {
      welcomePresentedFor = null;
      return;
    }
    if (!enabled || !signedInNow || welcomePresentedFor === userId || segments[0] !== '(tabs)') return;
    welcomePresentedFor = userId;
    router.push('/welcome');
  }, [enabled, segments, signedInNow, userId]);
}

/** True once a session appears after this run has seen the signed-out state (a fresh sign-in). */
function useSignedInThisRun(authStatus: string, userId: string | null) {
  const [sawSignedOut, setSawSignedOut] = useState(false);
  if (!sawSignedOut && authStatus === 'anonymous' && !userId) setSawSignedOut(true);
  return sawSignedOut && Boolean(userId);
}

function RootNavigator() {
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
    bootstrap,
    bootstrapFailure,
    bootstrapFailureStage,
    refetchProfile,
    refetchAgeAttestation,
    refetchSnapshot,
  } = useRootBootstrap({ userId, canUseNetworkSession, authStatus, session, lastBootstrapResult });
  const needsOnboarding = bootstrap.status === 'needsOnboarding';
  const { appReady, blockingStatus, showStack } = useRootStackVisibility({
    bootstrapStatus: bootstrap.status,
    sessionUserId: userId,
    canUseNetworkSession,
    offlineCacheHydrated,
  });

  useEffect(() => {
    if (bootstrap.status !== 'loading') {
      trackEvent('bootstrap_resolution', {
        resolution: bootstrap.status,
        failure_stage: bootstrapFailureStage,
      });
    }
  }, [bootstrap.status, bootstrapFailureStage]);

  // PERF-6: also wait for the persisted accent (bounded by a short timeout) so the first frame
  // after the splash already has it.
  const accentReady = useAccentPreferenceReady();
  useEffect(() => {
    if (appReady && accentReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [accentReady, appReady]);

  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    const destination = resolveBootstrapRedirect({
      // The Stack can now stay mounted under a verification prompt; routing must wait for it
      // (an offline user mid-onboarding must not be sent to the tabs).
      appReady: appReady && !blockingStatus,
      status: bootstrap.status,
      hasSession: Boolean(session),
      needsOnboarding,
      segments,
    });
    if (!destination) return;
    if (navigationRef.isReady()) {
      router.replace(destination);
      return;
    }
    // A freshly (re)mounted root can run this before the container is ready; `router.replace`
    // would then throw "Attempted to navigate before mounting the Root Layout", which unmounts
    // the whole root (no boundary above it) and feeds a remount loop. Navigate once it is ready.
    const unsubscribe = navigationRef.addListener('state', () => {
      if (!navigationRef.isReady()) return;
      unsubscribe();
      router.replace(destination);
    });
    return unsubscribe;
  }, [appReady, blockingStatus, bootstrap.status, navigationRef, needsOnboarding, segments, session]);

  const signedInNow = useSignedInThisRun(authStatus, userId);
  useWelcomePresentation(
    appReady
      && !blockingStatus
      && !resolveBootstrapRedirect({
        appReady: true,
        status: bootstrap.status,
        hasSession: Boolean(session),
        needsOnboarding,
        segments,
      }),
    segments,
    userId,
    signedInNow,
  );

  usePendingFriendInviteRedirect(
    appReady && bootstrap.status !== 'recoverableError' && Boolean(session) && canUseNetworkSession && !needsOnboarding,
    segments,
  );

  const recoverableErrorMessage: BootstrapMessage = {
    title: t(bootstrapFailure.title),
    hint: t(bootstrapFailure.hint),
    retryLabel: t('common.retry'),
    onRetry: () =>
      void (async () => {
        const result = await retryBootstrap();
        if (result.category !== 'online') return;
        await Promise.all([refetchProfile(), refetchAgeAttestation(), refetchSnapshot()]);
      })(),
    secondaryLabel: t('root.useAnotherAccount'),
    onSecondary: () =>
      void (async () => {
        await signOut();
        router.replace('/(auth)/login');
      })(),
  };
  const offlineVerificationMessage: BootstrapMessage = {
    title: t('root.offlineVerificationRequired'),
    hint: t('root.offlineVerificationHint'),
    retryLabel: t('common.retry'),
    onRetry: () => void retryBootstrap(),
  };
  const message = bootstrap.status === 'recoverableError'
    ? recoverableErrorMessage
    : bootstrap.status === 'offlineNeedsVerification'
      ? offlineVerificationMessage
      : null;

  if (!showStack) {
    if (!appReady || !message) return <BootstrapLoadingScreen backgroundColor={colors.launchBackground} />;
    return <BootstrapMessageScreen colors={colors} statusBarStyle={statusBarStyle} {...message} />;
  }

  return (
    <>
      <AppStack
        session={session}
        canUseNetworkSession={canUseNetworkSession}
        needsOnboarding={needsOnboarding}
        colors={colors}
        statusBarStyle={statusBarStyle}
        t={t}
      />
      {message ? <BootstrapMessageBanner colors={colors} {...message} /> : null}
    </>
  );
}

import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { View, ActivityIndicator, Text, Pressable, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { getCurrentUserProfile } from '../services/profileService';
import { supabase } from '../lib/supabase';
import { DeepLinkHandler } from '../lib/deepLink';
import { useAppTheme } from '../hooks/useAppTheme';
import { AppThemeProvider } from '../theme/theme-context';
import { APP_FONT_FAMILY } from '../theme/typography';
import { createAppQueryClient } from '../lib/queryClient';
import { bindReactQueryAppLifecycle } from '../lib/reactQueryNetwork';
import { ToastProvider } from 'react-native-pretty-toast';
import { VideoDraftProvider } from '../context/VideoDraftContext';
import { PhotoDraftProvider } from '../context/PhotoDraftContext';
import { initMonitoring } from '../lib/monitoring';
import { configureMediaCache } from '../lib/mediaCache';
import { configureForPlayback } from '../lib/audioSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { useTranslation } from 'react-i18next';
import { AppRealtimeSync } from '../components/sync/AppRealtimeSync';
import { queryKeys } from '../lib/queryKeys';
import { resolveNeedsOnboarding } from '../lib/profileGate';
import { hasCurrentAgeAttestation } from '../services/safetyService';
import { PushNotificationsProvider } from '../context/PushNotificationsProvider';

// Initialize monitoring at module load (runs once).
initMonitoring();

function RootLayout() {
  const [queryClient] = useState(() => createAppQueryClient());

  useEffect(() => bindReactQueryAppLifecycle(), []);
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
            <AppThemeProvider>
              <VideoDraftProvider>
                <PhotoDraftProvider>
                  <DeepLinkHandler />
                  <RootNavigator />
                </PhotoDraftProvider>
              </VideoDraftProvider>
            </AppThemeProvider>
          </QueryClientProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;

function RootNavigator() {
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const { session, loading } = useAuth();
  const segments = useSegments() as string[];
  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
  } = useQuery({
    queryKey: queryKeys.currentUserProfile,
    queryFn: getCurrentUserProfile,
    enabled: !!session,
    retry: 2,
  });
  const { data: ageAttested = false, isPending: ageAttestationPending } = useQuery({
    queryKey: queryKeys.currentAgeAttestation,
    queryFn: hasCurrentAgeAttestation,
    enabled: !!session,
    retry: 2,
  });
  const profileLoading = !!session && (profilePending || ageAttestationPending);
  const needsOnboarding = resolveNeedsOnboarding(!!session, profile, profileError, ageAttested);
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);

  const { topContentInset, bottomContentInset } = useScreenInsets('fullscreen');

  useEffect(() => {
    if (!loading) {
      setBootstrapTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setBootstrapTimedOut(true);
    }, 4000);

    return () => {
      clearTimeout(timer);
    };
  }, [loading]);

  const appReady = !loading;
  const inAuthGroup = segments[0] === '(auth)';
  const onResetPasswordScreen = segments[1] === 'reset-password';

  useEffect(() => {
    if (!appReady) return;

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (!session) return;

    // Do not make routing decisions until profile is fetched
    if (profilePending || ageAttestationPending) return;

    if (needsOnboarding && segments[1] !== 'onboarding' && !onResetPasswordScreen) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (!needsOnboarding && inAuthGroup && !onResetPasswordScreen) {
      router.replace('/(tabs)');
    }
  }, [appReady, inAuthGroup, needsOnboarding, onResetPasswordScreen, segments, session, profilePending, ageAttestationPending]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator color={colors.textPrimary} />
        {bootstrapTimedOut && (
          <>
            <Text style={{ color: colors.textMuted, marginTop: 16, textAlign: 'center', fontFamily: APP_FONT_FAMILY }}>
              {t('root.bootstrapTooLong')}
            </Text>
            <Pressable
              style={{
                marginTop: 18,
                backgroundColor: colors.buttonPrimaryBg,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
              }}
              onPress={async () => {
                await supabase.auth.signOut();
                router.replace('/(auth)/login');
              }}
            >
              <Text style={{ color: colors.buttonPrimaryText, fontWeight: '700', fontFamily: APP_FONT_FAMILY }}>{t('root.goToLogin')}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const content = (
    <>
      <StatusBar style={statusBarStyle} />
      {session ? <AppRealtimeSync userId={session.user.id} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.accent,
          headerTitleStyle: {
            fontFamily: APP_FONT_FAMILY,
            fontWeight: '700',
            color: colors.label,
          },
          headerLargeTitleStyle: {
            fontFamily: APP_FONT_FAMILY,
            fontWeight: '700',
            color: colors.label,
          },
          headerStyle: {
            backgroundColor: colors.background,
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen
        name="preview"
        options={{
          presentation: 'card',
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <Stack.Screen
        name="viewer"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <Stack.Screen
        name="friend-my-code"
        options={{
          presentation: 'card',
          headerShown: true,
          title: t('profile.myQrCode'),
          headerBackButtonDisplayMode: 'default',
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: colors.accent,
          headerTitleStyle: {
            fontFamily: APP_FONT_FAMILY,
            fontWeight: '700',
            color: colors.label,
          },
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
          headerTitleStyle: {
            fontFamily: APP_FONT_FAMILY,
            fontWeight: '700',
            color: colors.cameraControlTint,
          },
        }}
      />
      <Stack.Screen
        name="friend-invite"
        options={{ presentation: 'card', headerShown: true, title: t('root.invite') }}
      />
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

  if (!session || Platform.OS !== 'ios') return content;
  return (
    <PushNotificationsProvider userId={session.user.id} canNavigate={!needsOnboarding}>
      {content}
    </PushNotificationsProvider>
  );
}

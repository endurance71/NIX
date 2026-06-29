import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useReducer, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
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
import { initMonitoring } from '../lib/monitoring';
import { configureMediaCache } from '../lib/mediaCache';
import { configureForPlayback } from '../lib/audioSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { initBackgroundTaskService } from '../services/backgroundTaskService';
import { useTranslation } from 'react-i18next';
import { runWithFinally } from '../lib/runWithFinally';

// Initialize monitoring at module load (runs once).
initMonitoring();
enableFreeze(true);

type ProfileGateState = {
  profileLoading: boolean;
  needsOnboarding: boolean;
};

type ProfileGateAction =
  | { type: 'no_session' }
  | { type: 'fetch_start' }
  | { type: 'resolved'; profile: Awaited<ReturnType<typeof getCurrentUserProfile>> }
  | { type: 'fetch_error' };

function profileGateReducer(state: ProfileGateState, action: ProfileGateAction): ProfileGateState {
  switch (action.type) {
    case 'no_session':
      return { profileLoading: false, needsOnboarding: false };
    case 'fetch_start':
      return { ...state, profileLoading: true };
    case 'resolved':
      return {
        profileLoading: false,
        needsOnboarding: !action.profile?.username,
      };
    case 'fetch_error':
      return { profileLoading: false, needsOnboarding: true };
    default:
      return state;
  }
}

export default function RootLayout() {
  const [queryClient] = useState(() => createAppQueryClient());

  useEffect(() => bindReactQueryAppLifecycle(), []);
  useEffect(() => configureMediaCache(), []);
  useEffect(() => initBackgroundTaskService(() => {}), []);
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
                <DeepLinkHandler />
                <RootNavigator />
              </VideoDraftProvider>
            </AppThemeProvider>
          </QueryClientProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const { session, loading } = useAuth();
  const segments = useSegments() as string[];
  const [gate, dispatchGate] = useReducer(profileGateReducer, {
    profileLoading: false,
    needsOnboarding: false,
  });
  const { profileLoading, needsOnboarding } = gate;
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);

  const { topContentInset, bottomContentInset } = useScreenInsets('fullscreen');

  useEffect(() => {
    let mounted = true;
    let profileRaceTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const checkProfile = async () => {
      if (!session) {
        if (!mounted) return;
        dispatchGate({ type: 'no_session' });
        return;
      }

      dispatchGate({ type: 'fetch_start' });
      await runWithFinally(
        async () => {
          const timeoutPromise = new Promise<Awaited<ReturnType<typeof getCurrentUserProfile>> | null>(
            (resolve) => {
              profileRaceTimeoutId = setTimeout(() => resolve(null), 5000);
            }
          );
          const profile = await Promise.race([getCurrentUserProfile(), timeoutPromise]);
          if (!mounted) return;
          dispatchGate({ type: 'resolved', profile });
        },
        () => {
          if (profileRaceTimeoutId !== undefined) {
            clearTimeout(profileRaceTimeoutId);
            profileRaceTimeoutId = undefined;
          }
        }
      ).catch(() => {
        if (!mounted) return;
        dispatchGate({ type: 'fetch_error' });
      });
    };

    void checkProfile();
    return () => {
      mounted = false;
      if (profileRaceTimeoutId !== undefined) clearTimeout(profileRaceTimeoutId);
    };
  }, [session]);

  useEffect(() => {
    if (!loading && !profileLoading) return;

    const timer = setTimeout(() => {
      setBootstrapTimedOut(true);
    }, 4000);

    return () => {
      clearTimeout(timer);
      setBootstrapTimedOut(false);
    };
  }, [loading, profileLoading]);

  const appReady = !loading && !profileLoading;
  const inAuthGroup = segments[0] === '(auth)';
  const onResetPasswordScreen = segments[1] === 'reset-password';

  useEffect(() => {
    if (!appReady) return;

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
  }, [appReady, inAuthGroup, needsOnboarding, onResetPasswordScreen, segments, session]);

  if (loading || profileLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: 24,
          paddingTop: topContentInset,
          paddingBottom: bottomContentInset,
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

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.label,
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
      <Stack.Screen name="preview" options={{ presentation: 'card', headerShown: false }} />
      <Stack.Screen
        name="friend-my-code"
        options={{
          presentation: 'card',
          headerShown: true,
          title: t('root.qrMyCode'),
          headerBackButtonDisplayMode: 'minimal',
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
        }}
      />
      <Stack.Screen
        name="friend-invite"
        options={{ presentation: 'card', headerShown: true, title: t('root.invite') }}
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
}

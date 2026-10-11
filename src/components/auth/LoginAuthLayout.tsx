import { type PropsWithChildren, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VStack } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { AuthContentWidthContext } from '../ui/auth-content-width';
import { AppHost } from '../ui/app-host';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_FORM_HORIZONTAL_PADDING, getAuthContentWidth } from '../../theme/authLayout';

/**
 * Login-only shell: the native form as one content-sized card in a React Native scroll view,
 * transparent over the `LoginStage`.
 *
 * A SwiftUI `ScrollView` here re-applied safe-area and keyboard insets on the first tap anywhere
 * (and on focus), shifting the whole form down under the hero. The RN scroll view has no
 * automatic insets; placement comes from `formTop` / `formBottom` (screen edges, insets read
 * once) and `LoginStage` lifts the form above the keyboard.
 */
export function LoginAuthLayout({
  children,
  formTop,
  formBottom,
}: PropsWithChildren<{ formTop: number; formBottom: number }>) {
  const { statusBarStyle } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = getAuthContentWidth(windowWidth);
  const contentWidthValue = useMemo(() => ({ contentWidth }), [contentWidth]);

  return (
    <AuthContentWidthContext.Provider value={contentWidthValue}>
      <StatusBar style={statusBarStyle} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: formTop, paddingBottom: formBottom, alignItems: 'center' }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <AppHost
          style={{ width: contentWidth + AUTH_FORM_HORIZONTAL_PADDING * 2 }}
          matchContents={{ vertical: true }}
          safeAreaMode="fullBleed">
          <VStack alignment="center" spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
            <VStack alignment="leading" spacing={0} modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
              {children}
            </VStack>
          </VStack>
        </AppHost>
      </ScrollView>
    </AuthContentWidthContext.Provider>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

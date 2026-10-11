import { type PropsWithChildren, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, VStack } from '@expo/ui/swift-ui';
import { AuthContentWidthContext } from '../ui/auth-content-width';
import { AppHost } from '../ui/app-host';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_FORM_HORIZONTAL_PADDING,
  getAuthContentWidth,
} from '../../theme/authLayout';
import { frame, ignoreSafeArea, padding } from '@expo/ui/swift-ui/modifiers';

function contentColumnModifiers(contentWidth: number) {
  return [frame({ width: contentWidth, alignment: 'leading' })];
}

/**
 * Login-only shell: the scrollable native form column, transparent over the `LoginStage`.
 *
 * The host ignores every safe area (container and keyboard): it only learnt the insets after the
 * first system event (opening, an alert, a tap), and then shifted the whole form down under the
 * hero. Placement is ours instead: `formTop` / `formBottom` are measured from the screen edges
 * with insets read once, and `LoginStage` lifts the form above the keyboard.
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
      <AppHost
        style={{ flex: 1, backgroundColor: 'transparent' }}
        safeAreaMode="fullBleed">
        <StatusBar style={statusBarStyle} />
        <ScrollView
          axes="vertical"
          showsIndicators={false}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            ignoreSafeArea({ regions: 'all', edges: 'all' }),
          ]}>
          <VStack
            alignment="center"
            spacing={0}
            modifiers={[
              padding({
                top: formTop,
                leading: AUTH_FORM_HORIZONTAL_PADDING,
                bottom: formBottom,
                trailing: AUTH_FORM_HORIZONTAL_PADDING,
              }),
              frame({ maxWidth: Infinity, alignment: 'top' }),
            ]}>
            <VStack alignment="leading" spacing={0} modifiers={contentColumnModifiers(contentWidth)}>
              {children}
            </VStack>
          </VStack>
        </ScrollView>
      </AppHost>
    </AuthContentWidthContext.Provider>
  );
}

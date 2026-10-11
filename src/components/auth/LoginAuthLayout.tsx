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
 * Login-only shell: the scrollable native form column. Transparent, over the `LoginStage`
 * backdrop. `formTop` is measured from the top of the screen: the column ignores the top safe
 * area, whose value the hosting view only gets after the first system event (an alert, a
 * focused field), which made the whole form jump down under the hero. The keyboard is still
 * avoided natively.
 */
export function LoginAuthLayout({ children, formTop }: PropsWithChildren<{ formTop: number }>) {
  const { statusBarStyle } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = getAuthContentWidth(windowWidth);
  const contentWidthValue = useMemo(() => ({ contentWidth }), [contentWidth]);

  return (
    <AuthContentWidthContext.Provider value={contentWidthValue}>
      <AppHost
        style={{ flex: 1, backgroundColor: 'transparent' }}
        safeAreaMode="respect"
        useViewportSizeMeasurement>
        <StatusBar style={statusBarStyle} />
        <ScrollView
          axes="vertical"
          showsIndicators={false}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            ignoreSafeArea({ regions: 'container', edges: 'top' }),
          ]}>
          <VStack
            alignment="center"
            spacing={0}
            modifiers={[
              padding({
                top: formTop,
                leading: AUTH_FORM_HORIZONTAL_PADDING,
                bottom: AUTH_FORM_HORIZONTAL_PADDING,
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

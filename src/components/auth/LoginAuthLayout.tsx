import { type PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, VStack } from '@expo/ui/swift-ui';
import { AuthContentWidthContext } from '../ui/auth-content-width';
import { AppHost } from '../ui/app-host';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_FORM_HORIZONTAL_PADDING,
  AUTH_LOGIN_TOP_PADDING,
  getAuthContentWidth,
} from '../../theme/authLayout';
import { frame, padding } from '@expo/ui/swift-ui/modifiers';

function contentColumnModifiers(contentWidth: number) {
  return [frame({ width: contentWidth, alignment: 'leading' })];
}

/** Login-only shell: scrollable column for hero + form zones. */
export function LoginAuthLayout({ children }: PropsWithChildren) {
  const { colors, statusBarStyle } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = getAuthContentWidth(windowWidth);

  return (
    <AuthContentWidthContext.Provider value={{ contentWidth }}>
      <AppHost
        style={{ flex: 1, backgroundColor: colors.background }}
        safeAreaMode="respect"
        useViewportSizeMeasurement>
        <StatusBar style={statusBarStyle} />
        <ScrollView
          axes="vertical"
          showsIndicators={false}
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
          <VStack
            alignment="center"
            spacing={0}
            modifiers={[
              padding({
                top: AUTH_LOGIN_TOP_PADDING,
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

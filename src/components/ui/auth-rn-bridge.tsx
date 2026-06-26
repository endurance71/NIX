import { AppRnHostView } from './app-rn-host-view';
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

/** RN subtree inside FieldGroup SectionHeader/SectionFooter only — never as a section row (Android Compose requires AppRnHostView outside ListItem rows). */
export function AuthRnBridge({ children }: PropsWithChildren) {
  return (
    <AppRnHostView matchContents>
      <View style={styles.wrap}>{children}</View>
    </AppRnHostView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'stretch',
  },
});

import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';
import { Host, RNHostView } from '@expo/ui';

type NativeHostStyle = Pick<
  ViewStyle,
  | 'padding'
  | 'paddingHorizontal'
  | 'paddingVertical'
  | 'paddingTop'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingRight'
  | 'backgroundColor'
  | 'borderRadius'
  | 'borderWidth'
  | 'borderColor'
  | 'opacity'
  | 'width'
  | 'height'
>;

type AppRnHostViewProps = {
  children: ReactElement;
  matchContents?: boolean;
  style?: NativeHostStyle;
};

/** Android Compose requires RNHostView to be a direct child of Host. */
export function AppRnHostView({ children, matchContents, style }: AppRnHostViewProps) {
  return (
    <Host matchContents={matchContents} style={style}>
      <RNHostView matchContents={matchContents} style={style}>
        {children}
      </RNHostView>
    </Host>
  );
}

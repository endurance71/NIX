import type { ReactElement } from 'react';
import { Host, RNHostView } from '@expo/ui';

type AppRnHostViewProps = {
  children: ReactElement;
  matchContents?: boolean;
};

/** Android Compose requires RNHostView to be a direct child of Host. */
export function AppRnHostView({ children, matchContents }: AppRnHostViewProps) {
  return (
    <Host matchContents={matchContents}>
      <RNHostView matchContents={matchContents}>{children}</RNHostView>
    </Host>
  );
}

import { describe, expect, it } from 'vitest';
import { getAuthStackScreenOptions } from './authNavigation';

describe('getAuthStackScreenOptions', () => {
  it('uses the same minimal transparent navigation chrome on auth screens', () => {
    const options = getAuthStackScreenOptions({
      accent: '#007AFF',
      background: '#F2F2F7',
      label: '#000000',
    });

    expect(options).toMatchObject({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal',
      headerLargeTitle: false,
      headerTransparent: true,
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      headerTintColor: '#007AFF',
      headerTitleStyle: { color: '#000000' },
      headerStyle: { backgroundColor: 'transparent' },
      contentStyle: { backgroundColor: '#F2F2F7' },
    });
  });
});

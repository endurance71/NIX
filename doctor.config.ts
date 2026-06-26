/** Audytowane polityki RLS wymagają auth.uid() — false positive skanera na friendships_delete i upload_logs_select. */
export default {
  ignore: {
    overrides: [
      {
        files: ['docs/supabase_setup.sql', 'supabase/migrations/**'],
        rules: ['react-doctor/supabase-rls-policy-risk'],
      },
      {
        files: ['src/lib/audioSession.ts'],
        rules: ['deslop/unused-export'],
      },
      {
        // useFocusEffect needs a stable callback identity; otherwise its cleanup dispatches
        // on every render and causes a Maximum update depth loop.
        files: ['src/hooks/useCameraScreen.ts'],
        rules: ['react-doctor/react-compiler-no-manual-memoization'],
      },
      {
        // Platform-specific modules, Expo Router route modules, and shared design tokens
        // are resolved outside react-doctor's import graph but are used at runtime.
        files: [
          'src/components/navigation/app-tabs-layout.tsx',
          'src/components/ui/app-icon.tsx',
          'src/components/ui/app-icon.android.tsx',
          'src/components/ui/app-icon.ios.tsx',
          'src/components/ui/auth-form-layout.tsx',
          'src/components/ui/settings-list-screen.tsx',
          'src/theme/authLayout.ts',
          'src/theme/authTypography.ts',
          'src/theme/safeArea.ts',
        ],
        rules: ['deslop/unused-export'],
      },
    ],
  },
};

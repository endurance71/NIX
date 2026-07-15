export default {
  ignore: {
    overrides: [
      {
        // Historical SQL is retained for auditability and never applied. Active
        // migrations deliberately remain covered by the security scanner.
        files: ['docs/supabase_setup.sql', 'supabase/migrations_legacy/**'],
        rules: ['react-doctor/supabase-rls-policy-risk'],
      },
      {
        // The baseline is an immutable snapshot of the linked project. Its
        // redundant service-role policies are removed by the later hardening
        // migration, so the final schema no longer contains this risk.
        files: ['supabase/migrations/20260714104841_remote_baseline.sql'],
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
        // Native tab avatar preparation is intentionally sequential:
        // download remote avatar -> resize local file -> move resized PNG into cache.
        files: ['src/services/nativeTabAvatarIcon.ts'],
        rules: ['react-doctor/async-parallel'],
      },
      {
        // Platform-specific modules, Expo Router route modules, and shared design tokens
        // are resolved outside react-doctor's import graph but are used at runtime.
        files: [
          'src/components/navigation/app-tabs-layout.tsx',
          'src/components/ui/app-bottom-sheet.tsx',
          'src/components/ui/app-icon.tsx',
          'src/components/ui/auth-form-layout.tsx',
          'src/components/ui/settings-list-screen.tsx',
          'src/theme/authLayout.ts',
          'src/theme/safeArea.ts',
        ],
        rules: ['deslop/unused-export'],
      },
    ],
  },
};

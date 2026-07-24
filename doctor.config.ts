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
        files: [
          'src/hooks/useCameraScreen.ts',
          'src/app/friend-scan-qr.tsx',
          'src/app/new-chat.tsx',
          'src/app/send-to.tsx',
          'src/hooks/useInboxScreen.ts',
        ],
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
      {
        // Static auth field lists; key falls back to index only when children omit React keys.
        files: ['src/components/ui/auth-form-layout.tsx'],
        rules: ['react-doctor/no-array-index-as-key'],
      },
      {
        // Success path navigates away / signs out; loading reset lives in catch only.
        files: ['src/app/(tabs)/profile/delete-account.tsx'],
        rules: ['react-doctor/no-loading-flag-reset-outside-finally'],
      },
      {
        // Public helpers exercised by unit tests; react-doctor import graph misses test files.
        // Intl formatters are created once per locale/options key via module-level Map cache.
        files: ['src/lib/chatTimeline.ts'],
        rules: ['deslop/unused-export', 'react-doctor/js-hoist-intl'],
      },
      {
        files: ['src/services/textMessageService.ts'],
        rules: ['deslop/unused-export'],
      },
    ],
  },
};

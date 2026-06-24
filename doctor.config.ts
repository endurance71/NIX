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
    ],
  },
};

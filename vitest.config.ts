import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@expo/ui': path.resolve(__dirname, 'vitest-shims/expo-ui-empty.ts'),
      '@expo/ui/community/menu': path.resolve(__dirname, 'vitest-shims/expo-ui-empty.ts'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
    // Domyślne fork pool potrafi się zawiesić (timeout workera) w niektórych środowiskach / Cursor.
    pool: 'threads',
  },
});

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@expo/ui': path.resolve(configDirectory, 'vitest-shims/expo-ui-empty.ts'),
      '@expo/ui/community/menu': path.resolve(configDirectory, 'vitest-shims/expo-ui-empty.ts'),
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

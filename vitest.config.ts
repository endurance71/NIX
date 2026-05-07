import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
    // Domyślne fork pool potrafi się zawiesić (timeout workera) w niektórych środowiskach / Cursor.
    pool: 'threads',
  },
});

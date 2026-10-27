import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const engineSrc = fileURLToPath(new URL('./vendor/osrs-dps-calc/src', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${engineSrc}/` },
      { find: 'next/image', replacement: fileURLToPath(new URL('./src/stubs/next-image.ts', import.meta.url)) },
    ],
  },
  // The engine reads Next.js build-time env vars, which don't exist in a plain browser build.
  define: {
    'process.env.NEXT_PUBLIC_HIT_DIST_SANITY_CHECK': 'undefined',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    __ENGINE_COMMIT__: JSON.stringify(execSync('git -C vendor/osrs-dps-calc rev-parse HEAD').toString().trim()),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  worker: { format: 'es' },
  server: {
    // Saved gear, stats and results live in the browser per origin, so the port must not drift between runs.
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});

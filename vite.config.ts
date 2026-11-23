import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const engineSrc = fileURLToPath(new URL('./vendor/osrs-dps-calc/src', import.meta.url));
// Compiled by `npm run prepare-engine` with the engine's own TypeScript.
const engineBuild = fileURLToPath(new URL('./vendor/osrs-dps-calc/build/src', import.meta.url));
const engineCommit = execSync('git -C vendor/osrs-dps-calc rev-parse HEAD').toString().trim();
const builtCommitFile = fileURLToPath(new URL('./vendor/osrs-dps-calc/build/engine-commit', import.meta.url));
const builtCommit = existsSync(builtCommitFile) ? readFileSync(builtCommitFile, 'utf8').trim() : undefined;
if (builtCommit !== engineCommit) {
  throw new Error('The compiled engine does not match vendor/osrs-dps-calc; run `npm run prepare-engine`.');
}

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // The engine has its own node_modules; it must not get a second React.
    dedupe: ['react', 'react-dom'],
    alias: [
      // Raw source for parsing, and images, which aren't compiled.
      { find: /^@\/(.+\?raw|public\/.+)$/, replacement: `${engineSrc}/$1` },
      { find: /^@\//, replacement: `${engineBuild}/` },
      { find: 'next/image', replacement: fileURLToPath(new URL('./src/stubs/next-image.ts', import.meta.url)) },
    ],
  },
  // The engine reads Next.js build-time env vars, which don't exist in a plain browser build.
  define: {
    'process.env.NEXT_PUBLIC_HIT_DIST_SANITY_CHECK': 'undefined',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    __APP_COMMIT__: JSON.stringify(execSync('git rev-parse HEAD').toString().trim()),
    __ENGINE_COMMIT__: JSON.stringify(engineCommit),
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

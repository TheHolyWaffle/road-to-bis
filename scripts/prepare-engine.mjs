// Installs the engine submodule's own dependencies and compiles it with its own TypeScript into
// vendor/osrs-dps-calc/build (JS and .d.ts), so neither our dependencies nor our build tools touch the engine source.
// Runs as our postinstall; rerun it with `npm run prepare-engine` after moving the submodule.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const engine = fileURLToPath(new URL('../vendor/osrs-dps-calc/', import.meta.url));

if (!existsSync(`${engine}package.json`)) {
  console.warn('Engine submodule is missing; run `git submodule update --init`, then `npm run prepare-engine`.');
  process.exit(0);
}

const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: engine, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: Infinity,
  });
  if (result.error) throw result.error;
  return result;
};

const yarnPath = readFileSync(`${engine}.yarnrc.yml`, 'utf8').match(/^yarnPath:\s*(.+)$/m)?.[1].trim();
if (!yarnPath) throw new Error('No yarnPath in the engine .yarnrc.yml');
const install = run([yarnPath, 'install', '--immutable']);
if (install.status !== 0) {
  process.stdout.write(install.stdout);
  throw new Error('Installing the engine dependencies failed');
}

rmSync(`${engine}build`, { recursive: true, force: true });
mkdirSync(`${engine}build`);
writeFileSync(`${engine}build/tsconfig.json`, JSON.stringify({
  extends: '../tsconfig.json',
  include: ['../next-env.d.ts', '../src'],
  compilerOptions: { noEmit: false, declaration: true, incremental: false, rootDir: '..', outDir: '.', target: 'ES2022' },
}));
// tsc still writes its output when the engine has type errors under its own config.
const { stdout } = run(['node_modules/typescript/bin/tsc', '-p', 'build/tsconfig.json']);
if (!existsSync(`${engine}build/src/lib/PlayerVsNPCCalc.js`)) {
  process.stdout.write(stdout);
  throw new Error('Compiling the engine failed');
}
// vite.config.ts compares this to the submodule's HEAD to catch a build left behind by a submodule move.
const commit = spawnSync('git', ['-C', engine, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
writeFileSync(`${engine}build/engine-commit`, commit);
const errors = stdout.match(/error TS\d+/g)?.length ?? 0;
console.log(`Engine compiled to vendor/osrs-dps-calc/build${errors ? ` (${errors} type errors in the engine, ignored)` : ''}`);

// Installs the engine submodule's own dependencies into vendor/osrs-dps-calc/node_modules, so engine imports resolve to
// the versions in its yarn.lock instead of ours. Runs as our postinstall; rerun it after moving the submodule.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const engine = fileURLToPath(new URL('../vendor/osrs-dps-calc/', import.meta.url));

if (!existsSync(`${engine}package.json`)) {
  console.warn('Engine submodule is missing; run `git submodule update --init`, then `npm run install-engine-deps`.');
  process.exit(0);
}

const yarnPath = readFileSync(`${engine}.yarnrc.yml`, 'utf8').match(/^yarnPath:\s*(.+)$/m)?.[1].trim();
if (!yarnPath) throw new Error('No yarnPath in the engine .yarnrc.yml');

execFileSync(process.execPath, [yarnPath, 'install', '--immutable'], { cwd: engine, stdio: 'inherit' });

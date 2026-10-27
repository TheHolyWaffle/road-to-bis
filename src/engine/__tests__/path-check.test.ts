import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monsterLabel } from '../build-player';
import { buildCandidates, consumedParts, resaleValues } from '../candidates';
import { itemById } from '../items';
import {
  averageGain, buildPath, killSeconds, type Path, type PathInput, stepsWithin,
} from '../path';
import { indexPrices } from '../prices';
import { runSearch, type SearchOutput } from '../search';
import { createTaskRunner } from '../task-runner';
import { FAMILIES, type MonsterSpec } from '../types';
import { findMonsterKey, taskOnly } from '../../lib/monster-presets';
import { sampleSettings, sampleBank } from './fixtures';

const mappingFile = new URL('../../../scratch/mapping.json', import.meta.url);
const latestFile = new URL('../../../scratch/latest.json', import.meta.url);
const reportFile = new URL('../../../scratch/path-check.txt', import.meta.url);

const BUDGETS = [5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 750e6];
const BEAMS = [{ width: 2, branching: 2 }, { width: 4, branching: 4 }, { width: 8, branching: 6 }];

const m = (gp: number) => `${(gp / 1e6).toFixed(1)}M`;
const pct = (g: number) => `${(g * 100).toFixed(1)}%`;

/** The gain after the steps that fit in `budget`. */
const gainAt = (path: Path, budget: number) => {
  const n = stepsWithin(path, budget);
  return n ? path.steps[n - 1].gain : 0;
};

const BOSSES: [name: string, version?: string][] = [
  ['Vorkath', 'Post-quest'], ['General Graardor'], ["Kree'arra"], ['Commander Zilyana'], ['Zulrah', 'Serpentine'],
  ['Alchemical Hydra', 'Electric'], ['Cerberus'], ['Vardorvis', 'Post-quest'],
];

/** Searches the sample bank's cost curves at these bosses, and the path input for them. */
const prepare = async (bosses: [name: string, version?: string][]) => {
  const prices = indexPrices(JSON.parse(readFileSync(mappingFile, 'utf8')), JSON.parse(readFileSync(latestFile, 'utf8')).data);
  const { ownedIds, quantities } = sampleBank();
  const upgrades = buildCandidates(ownedIds, prices, {
    families: FAMILIES, excluded: new Set(), ownedQuantities: quantities, includeEarned: false,
  });
  const monsters: MonsterSpec[] = bosses.map((b) => findMonsterKey(b)!).map((key) => ({
    key, weight: 1, families: FAMILIES, onTask: taskOnly(key),
  }));
  const candidates = upgrades.map((u) => [u.itemIds[0], u.cost] as [number, number]);
  // The search takes minutes at many bosses, so its result is kept for the same monsters; PATH_CHECK_FRESH=1 searches
  // again, say after changing the bank or prices.
  const cacheFile = new URL(`../../../scratch/path-check-search-${bosses.length}.json`, import.meta.url);
  const cached: { monsters: MonsterSpec[]; out: SearchOutput } | null = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
  let out: SearchOutput;
  if (cached?.out && JSON.stringify(cached.monsters) === JSON.stringify(monsters) && !process.env.PATH_CHECK_FRESH) ({ out } = cached);
  else {
    const run = createTaskRunner({
      ownedIds, settings: sampleSettings, monsters, candidates,
    });
    out = await runSearch({ monsters, objective: 'dps', ownedIds }, async (task) => {
      // Yields between tasks, or vitest's worker times out.
      await new Promise((r) => { setTimeout(r); });
      return run(task);
    }, () => {});
    writeFileSync(cacheFile, JSON.stringify({ monsters, out }));
  }
  const input: PathInput = {
    monsters,
    frontiers: out.frontiers,
    objective: 'dps',
    ownedIds,
    buyCost: new Map(candidates),
    resale: resaleValues(ownedIds, prices, upgrades),
    consumes: consumedParts(upgrades, ownedIds),
    sell: false,
  };
  return { input, frontiers: out.frontiers };
};

// Slow, so it only runs with `npm run path-check`.
describe.skipIf(!existsSync(mappingFile) || !process.env.PATH_CHECK)('path against the cost curve', () => {
  it('checks the sample bank at Vorkath', async () => {
    const { input: base, frontiers } = await prepare([BOSSES[0]]);
    const { monsters } = base;
    const names = (ids: number[]) => ids.map((id) => itemById(id)!.name).join(' + ');
    const lines: string[] = [];

    // The best single loadout the search found at each price, ignoring how you'd get there.
    const greedy = buildPath(base);
    const key = monsters[0].key;
    const loadouts = Object.entries(frontiers[key] ?? {}).flatMap(([family, f]) => [
      ...f!.points, ...f!.alternatives ?? [],
    ].map((p) => ({ family, cost: p.cost, gain: killSeconds(greedy, [{ ...greedy.start[0], score: p.dps }])[0] }))
      .map((p) => ({ ...p, gain: killSeconds(greedy, greedy.start)[0] / p.gain - 1 })));
    const envelope = (budget: number) => Math.max(0, ...loadouts.filter((l) => l.cost <= budget).map((l) => l.gain));
    // As a path whose every step reaches the curve.
    const curvePath = [...new Set(loadouts.map((l) => l.cost))].sort((x, y) => x - y)
      .map((cost) => ({ totalSpent: cost, gain: envelope(cost) }));
    const describe = (label: string, path: Path, horizon: number, ms: number) => {
      lines.push('', `--- ${label}: ${path.steps.length} steps, ${m(path.steps.at(-1)?.totalSpent ?? 0)} in all, average gain up to ${m(horizon)} ${pct(averageGain(path.steps, horizon))}, ${ms.toFixed(0)}ms`);
      path.steps.forEach((s, i) => {
        const below = envelope(s.totalSpent) - s.gain;
        lines.push(`${String(i + 1).padStart(3)}. ${m(s.totalSpent).padStart(8)} ${pct(s.gain).padStart(6)}${base.sell ? '' : `  curve ${pct(envelope(s.totalSpent)).padStart(6)}${below > 1e-3 ? ` (${pct(below)} below)` : ''}`}  buy ${names(s.buy)} (${m(s.spent)})${s.sell.length ? `  sell ${names(s.sell)} (${m(s.refunded)})` : ''}`);
      });
      lines.push(`     at ${BUDGETS.map((b) => `${m(b)} ${pct(gainAt(path, b))}`).join(', ')}`);
    };

    for (const sell of [false, true]) {
      base.sell = sell;
      lines.push('', `===== ${monsterLabel(key)}, ${sell ? 'selling what is replaced (net gp, so not comparable to the curve)' : 'keeping everything (gross gp, comparable to the curve)'}`);
      let t = performance.now();
      const g = buildPath(base);
      const gMs = performance.now() - t;
      const horizon = Math.max(0, ...g.steps.map((s) => s.totalSpent));
      if (!sell) {
        lines.push(`curve: average gain up to ${m(horizon)} ${pct(averageGain(curvePath, horizon))}`);
        lines.push(`     at ${BUDGETS.map((b) => `${m(b)} ${pct(envelope(b))}`).join(', ')}`);
      }
      describe('greedy', g, horizon, gMs);
      for (const beam of BEAMS) {
        t = performance.now();
        const b = buildPath({ ...base, beam });
        describe(`beam ${beam.width}x${beam.branching}`, b, horizon, performance.now() - t);
      }
    }
    writeFileSync(reportFile, `${lines.join('\n')}\n`);
    expect(greedy.steps.length).toBeGreaterThan(0);
  }, 600_000);

  it('compares greedy and beam paths across the benchmark bosses', async () => {
    const { input } = await prepare(BOSSES);
    const lines: string[] = ['', `===== ${BOSSES.length} bosses`];
    for (const sell of [false, true]) {
      const base = { ...input, sell };
      let t = performance.now();
      const greedy = buildPath(base);
      const horizon = Math.max(0, ...greedy.steps.map((s) => s.totalSpent));
      const row = (label: string, path: Path, ms: number) => lines.push(`${sell ? 'sell' : 'keep'} ${label.padEnd(10)} ${String(path.steps.length).padStart(3)} steps, ${m(path.steps.at(-1)?.totalSpent ?? 0).padStart(8)}, average up to ${m(horizon)} ${pct(averageGain(path.steps, horizon)).padStart(6)}, ${(ms / 1000).toFixed(1)}s  at ${BUDGETS.map((b) => `${m(b)} ${pct(gainAt(path, b))}`).join(', ')}`);
      row('greedy', greedy, performance.now() - t);
      for (const beam of BEAMS.slice(0, 2)) {
        t = performance.now();
        row(`beam ${beam.width}x${beam.branching}`, buildPath({ ...base, beam }), performance.now() - t);
      }
    }
    writeFileSync(reportFile, `${readFileSync(reportFile, 'utf8')}${lines.join('\n')}\n`);
  }, 1_800_000);
});

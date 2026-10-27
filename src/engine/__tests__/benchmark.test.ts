import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import recommended from '../../data/recommended-equipment.json';
import { monsterLabel } from '../build-player';
import { buildCandidates, consumedParts, resaleValues } from '../candidates';
import { itemById } from '../items';
import { buildPath } from '../path';
import { indexPrices } from '../prices';
import { runSearch } from '../search';
import { createTaskRunner } from '../task-runner';
import {
  FAMILIES, type Family, type LoadoutRef, type MonsterSpec, SLOTS,
} from '../types';
import { findMonsterKey, taskOnly } from '../../lib/monster-presets';
import { sampleSettings, sampleBank } from './fixtures';

const mappingFile = new URL('../../../scratch/mapping.json', import.meta.url);
const latestFile = new URL('../../../scratch/latest.json', import.meta.url);
const reportFile = new URL('../../../scratch/benchmark.txt', import.meta.url);

interface Table { page: string; style: string | null; slots: Record<string, string[][]> }

const BOSSES: [name: string, version: string | undefined, page: string][] = [
  ['Vorkath', 'Post-quest', 'Vorkath/Strategies'],
  ['General Graardor', undefined, 'General Graardor/Strategies'],
  ["Kree'arra", undefined, "Kree'arra/Strategies"],
  ['Commander Zilyana', undefined, 'Commander Zilyana/Strategies'],
  ['Zulrah', 'Serpentine', 'Zulrah/Strategies'],
  ['Alchemical Hydra', 'Electric', 'Alchemical Hydra/Strategies'],
  ['Cerberus', undefined, 'Cerberus/Strategies'],
  ['Vardorvis', 'Post-quest', 'Vardorvis/Strategies'],
];

/** Words in a table's style that name each family, like "Tbow / Bowfa" for ranged. */
const STYLE_WORDS: Record<Family, string[]> = {
  melee: ['melee'],
  ranged: ['range', 'tbow', 'bowfa', 'crossbow', 'chinchompa'],
  magic: ['magic', 'mage'],
};

/** The family a table is for; tank tables trade damage for defence, which the search doesn't value, so they're left out. */
const familyOfStyle = (style: string | null): Family | null => {
  const s = (style ?? '').toLowerCase();
  if (s.includes('tank')) return null;
  return FAMILIES.find((f) => STYLE_WORDS[f].some((w) => s.includes(w))) ?? null;
};

/** Variants that differ only in ways the DPS search ignores, like defence (Masori (f)) or which boots are infused. */
const normalise = (name: string) => name.toLowerCase()
  .replace(/^avernic treads.*$/, 'avernic treads')
  .replace(/ \(f\)$/, '')
  .replace(/^imbued (saradomin|guthix|zamorak) (max )?cape$/, 'imbued god cape')
  .replace(/^dragon (fire )?arrows?.*$/, 'dragon arrow')
  .replace(/^salve amulet ?\(ei?\)$/, 'salve amulet (e)');

/** "T1".."T5" for the wiki tier an item is listed in for this boss and style, or "--" when it isn't listed. */
const tierOf = (tables: Table[], family: Family, slot: string, name: string) => {
  let best: number | null = null;
  for (const t of tables) {
    if (familyOfStyle(t.style) !== family) continue;
    t.slots[slot]?.forEach((tier, i) => {
      if (tier.some((n) => normalise(n) === normalise(name)) && (best === null || i < best)) best = i;
    });
  }
  return best === null ? '--' : `T${best + 1}`;
};

const describeLoadout = (loadout: LoadoutRef | null, tables: Table[], family: Family) => (loadout
  ? SLOTS.filter((s) => loadout.equipment[s] !== undefined).map((s) => {
    const name = itemById(loadout.equipment[s]!)!.name;
    return `${name} [${tierOf(tables, family, s, name)}]`;
  }).join(', ')
  : '-');

const m = (gp: number) => `${(gp / 1e6).toFixed(1)}M`;

// Slow, so it only runs with `npm run benchmark`.
describe.skipIf(!existsSync(mappingFile) || !process.env.BENCHMARK)('benchmark against the wiki', () => {
  it('builds a path for the sample bank', async () => {
    const prices = indexPrices(JSON.parse(readFileSync(mappingFile, 'utf8')), JSON.parse(readFileSync(latestFile, 'utf8')).data);
    const { ownedIds, quantities } = sampleBank();
    const upgrades = buildCandidates(ownedIds, prices, {
      families: FAMILIES, excluded: new Set(), ownedQuantities: quantities, includeEarned: false,
    });
    const monsters: MonsterSpec[] = BOSSES.map(([name, version]) => findMonsterKey([name, version])!).map((key) => ({
      key, weight: 1, families: FAMILIES, onTask: taskOnly(key),
    }));
    const candidates = upgrades.map((u) => [u.itemIds[0], u.cost] as [number, number]);
    const run = createTaskRunner({
      ownedIds, settings: sampleSettings, monsters, candidates,
    });
    const t = performance.now();
    const out = await runSearch({ monsters, objective: 'dps', ownedIds }, async (task) => {
      // Yields between tasks, or vitest's worker times out.
      await new Promise((r) => { setTimeout(r); });
      return run(task);
    }, () => {});
    const lines: string[] = [`${upgrades.length} candidates, ${out.calcs} calcs, ${((performance.now() - t) / 1000).toFixed(1)}s`];

    const agreement: [t1: number, listed: number, slots: number][] = [];
    BOSSES.forEach(([, , page], i) => {
      const tables = (recommended as Table[]).filter((x) => x.page === page);
      lines.push('', `=== ${monsterLabel(monsters[i].key)} (wiki tables: ${tables.map((x) => x.style).join(', ')})`);
      for (const f of FAMILIES) {
        const fr = out.frontiers[monsters[i].key]?.[f];
        if (!fr) continue;
        lines.push(`  ${f} now ${fr.baseline.dps.toFixed(2)}: ${describeLoadout(fr.baseline.loadout, tables, f)}`);
        for (const p of fr.points) {
          const fresh = Object.values(p.loadout.equipment).filter((id) => !ownedIds.includes(id)).map((id) => itemById(id)!.name);
          lines.push(`    ${m(p.cost).padStart(8)} -> ${p.dps.toFixed(2)}  +[${fresh.join(', ')}]`);
        }
        const bis = fr.points.at(-1);
        if (bis) {
          lines.push(`  ${f} BiS ${bis.dps.toFixed(2)}: ${describeLoadout(bis.loadout, tables, f)}`);
          if (tables.some((x) => familyOfStyle(x.style) === f)) {
            const tiers = SLOTS.filter((s) => bis.loadout.equipment[s] !== undefined).map((s) => tierOf(tables, f, s, itemById(bis.loadout.equipment[s]!)!.name));
            agreement.push([tiers.filter((x) => x === 'T1').length, tiers.filter((x) => x !== '--').length, tiers.length]);
          }
        }
      }
    });

    const sum = (k: number) => agreement.reduce((a, x) => a + x[k], 0);
    lines.splice(1, 0, `Best-in-slot items in the wiki's tables for that style: ${sum(1)}/${sum(2)} (${sum(0)} in the top tier)`);
    const resale = resaleValues(ownedIds, prices, upgrades);
    const path = buildPath({
      monsters, frontiers: out.frontiers, objective: 'dps', ownedIds, buyCost: new Map(candidates), resale, consumes: consumedParts(upgrades, ownedIds), sell: true,
    });
    lines.push('', '=== Path');
    path.steps.forEach((s, i) => {
      const names = (ids: number[]) => ids.map((id) => itemById(id)!.name).join(' + ');
      lines.push(`${String(i + 1).padStart(2)}. ${m(s.totalSpent).padStart(8)} total, +${(s.gain * 100).toFixed(1)}%  buy ${names(s.buy)} (${m(s.spent)})${s.sell.length ? `  sell ${names(s.sell)} (${m(s.refunded)})` : ''}  for ${monsterLabel(s.target.monster)} ${s.target.family}`);
    });
    writeFileSync(reportFile, `${lines.join('\n')}\n`);
    expect(path.steps.length).toBeGreaterThan(0);
  }, 600_000);
});

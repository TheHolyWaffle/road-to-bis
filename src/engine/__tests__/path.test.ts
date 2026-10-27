import { describe, expect, it } from 'vitest';
import { findMonsterKey } from '../../lib/monster-presets';
import { buildPath, killSeconds, type PathInput } from '../path';
import type { Frontier, MonsterSpec } from '../types';

const serpentine = findMonsterKey(['Zulrah', 'Serpentine'])!;
const magma = findMonsterKey(['Zulrah', 'Magma'])!;

const OWNED = 1;
const FOR_SERPENTINE = 2;
const FOR_MAGMA = 3;

/** A ranged curve where owning `item` takes DPS from `now` to `upgraded`. */
const frontier = (now: number, item: number, upgraded: number): Frontier => ({
  baseline: { loadout: { equipment: { weapon: OWNED }, styleName: 'Rapid', styleStance: 'Rapid', spell: null }, dps: now },
  points: [{
    loadout: { equipment: { weapon: OWNED, body: item }, styleName: 'Rapid', styleStance: 'Rapid', spell: null }, dps: upgraded, cost: 10e6,
  }],
});

const input = (monsters: MonsterSpec[]): PathInput => ({
  monsters,
  frontiers: { [serpentine]: { ranged: frontier(5, FOR_SERPENTINE, 10) }, [magma]: { ranged: frontier(1, FOR_MAGMA, 2) } },
  ownedIds: [OWNED],
  buyCost: new Map([[FOR_SERPENTINE, 10e6], [FOR_MAGMA, 10e6]]),
  resale: new Map(),
  consumes: new Map(),
  sell: false,
});

const spec = (k: string, extra: Partial<MonsterSpec> = {}): MonsterSpec => ({
  key: k, weight: 1, families: ['ranged'], onTask: false, ...extra,
});

describe('path', () => {
  it('scores phases of one fight by the time a whole kill takes', () => {
    const path = buildPath(input([
      spec(serpentine, { encounter: 'Zulrah', hp: 250 }),
      spec(magma, { encounter: 'Zulrah', hp: 250 }),
    ]));
    // Serpentine takes 50s and magma 250s, so doubling magma's DPS saves far more time.
    expect(path.encounters).toHaveLength(1);
    expect(path.steps.map((s) => s.buy)).toEqual([[FOR_MAGMA], [FOR_SERPENTINE]]);
    expect(killSeconds(path, path.start)[0]).toBeCloseTo(300);
    expect(path.steps[0].gain).toBeCloseTo(300 / 175 - 1);
    expect(path.steps[1].gain).toBeCloseTo(1);
  });

  it('weighs separate monsters by their own speed-up', () => {
    const path = buildPath(input([spec(serpentine), spec(magma, { weight: 2 })]));
    expect(path.encounters).toHaveLength(2);
    expect(path.steps[0].buy).toEqual([FOR_MAGMA]);
    expect(path.steps[0].gain).toBeCloseTo(2 / 3);
  });

  it('splits a bundle into parts that pay off on their own', () => {
    const ref = (body?: number, legs?: number) => ({
      equipment: { weapon: OWNED, body, legs }, styleName: 'Rapid', styleStance: 'Rapid', spell: null,
    });
    const curve = (withBodyAlone: boolean): Frontier => ({
      baseline: { loadout: ref(), dps: 5 },
      points: [{ loadout: ref(FOR_SERPENTINE, FOR_MAGMA), dps: 10, cost: 20e6 }],
      alternatives: withBodyAlone ? [{ loadout: ref(FOR_SERPENTINE), dps: 6, cost: 10e6 }] : [],
    });
    const run = (withBodyAlone: boolean) => buildPath({
      ...input([spec(serpentine)]), frontiers: { [serpentine]: { ranged: curve(withBodyAlone) } },
    });
    expect(run(true).steps.map((s) => s.buy)).toEqual([[FOR_SERPENTINE], [FOR_MAGMA]]);
    expect(run(false).steps.map((s) => s.buy)).toEqual([[FOR_SERPENTINE, FOR_MAGMA]]);
  });

  it('takes steps that cost nothing first, however little they add', () => {
    const ref = (body?: number, legs?: number) => ({
      equipment: { weapon: OWNED, body, legs }, styleName: 'Rapid', styleStance: 'Rapid', spell: null,
    });
    const path = buildPath({
      ...input([spec(serpentine)]),
      frontiers: {
        [serpentine]: {
          ranged: {
            baseline: { loadout: ref(), dps: 5 },
            points: [
              { loadout: ref(FOR_SERPENTINE), dps: 6, cost: 0 },
              { loadout: ref(undefined, FOR_MAGMA), dps: 7, cost: 50e3 },
            ],
          },
        },
      },
      buyCost: new Map([[FOR_SERPENTINE, 0], [FOR_MAGMA, 50e3]]),
    });
    expect(path.steps[0].buy).toEqual([FOR_SERPENTINE]);
  });
});

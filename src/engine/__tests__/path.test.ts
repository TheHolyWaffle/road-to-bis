import { describe, expect, it } from 'vitest';
import { findMonsterKey } from '../../lib/monster-presets';
import {
  averageGain, buildPath, gainWithin, killSeconds, type PathInput, type PathStep,
} from '../path';
import type { Frontier, MonsterSpec } from '../types';

const serpentine = findMonsterKey(['Zulrah', 'Serpentine'])!;
const magma = findMonsterKey(['Zulrah', 'Magma'])!;

const OWNED = 1;
const FOR_SERPENTINE = 2;
const FOR_MAGMA = 3;

/** A ranged loadout with the owned weapon. */
const ref = (body?: number, legs?: number) => ({
  equipment: { weapon: OWNED, body, legs }, styleName: 'Rapid', styleStance: 'Rapid', spell: null,
});

/** A ranged curve where owning `item` takes DPS from `now` to `upgraded`. */
const frontier = (now: number, item: number, upgraded: number): Frontier => ({
  baseline: { loadout: ref(), dps: now },
  points: [{ loadout: ref(item), dps: upgraded, cost: 10e6 }],
});

const input = (monsters: MonsterSpec[]): PathInput => ({
  monsters,
  frontiers: { [serpentine]: { ranged: frontier(5, FOR_SERPENTINE, 10) }, [magma]: { ranged: frontier(1, FOR_MAGMA, 2) } },
  ownedIds: [OWNED],
  buyCost: new Map([[FOR_SERPENTINE, 10e6], [FOR_MAGMA, 10e6]]),
  resale: new Map(),
  parts: new Map(),
  stock: new Map(),
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

  it('counts an owned material as free only once', () => {
    const path = buildPath({
      ...input([spec(serpentine)]),
      frontiers: {
        [serpentine]: {
          ranged: {
            baseline: { loadout: ref(), dps: 5 },
            points: [{ loadout: ref(FOR_SERPENTINE), dps: 6, cost: 0 }, { loadout: ref(FOR_SERPENTINE, FOR_MAGMA), dps: 7, cost: 0 }],
          },
        },
      },
      buyCost: new Map([[FOR_SERPENTINE, 0], [FOR_MAGMA, 0]]),
      // Both are made from the one jaw you own.
      parts: new Map([FOR_SERPENTINE, FOR_MAGMA].map((id) => [id, [{ name: 'basilisk jaw', quantity: 1, unitCost: 3e6 }]])),
      stock: new Map([['basilisk jaw', 1]]),
    });
    expect(path.steps.map((s) => s.costs)).toEqual([[0], [3e6]]);
  });

  it('buys back owned equipment a recipe needs once it has been used up', () => {
    const HELM = 9;
    const path = buildPath({
      ...input([spec(serpentine)]),
      ownedIds: [OWNED, HELM],
      frontiers: {
        [serpentine]: {
          ranged: {
            baseline: { loadout: ref(), dps: 5 },
            points: [{ loadout: ref(FOR_SERPENTINE), dps: 6, cost: 0 }, { loadout: ref(FOR_SERPENTINE, FOR_MAGMA), dps: 7, cost: 0 }],
          },
        },
      },
      buyCost: new Map([[FOR_SERPENTINE, 0], [FOR_MAGMA, 0]]),
      parts: new Map([FOR_SERPENTINE, FOR_MAGMA].map((id) => [id, [{
        name: 'helm', quantity: 1, id: HELM, unitCost: 50e3,
      }]])),
    });
    expect(path.steps.map((s) => [s.costs, s.consumed])).toEqual([[[0], [HELM]], [[50e3], []]]);
  });

  it('plans the best use of a budget, not just the start of the full path', () => {
    const BIG = 4;
    const curve: Frontier = {
      baseline: { loadout: ref(), dps: 5 },
      points: [
        { loadout: ref(FOR_SERPENTINE), dps: 6, cost: 10e6 },
        { loadout: ref(undefined, BIG), dps: 9, cost: 100e6 },
        { loadout: ref(FOR_SERPENTINE, BIG), dps: 10, cost: 110e6 },
      ],
    };
    const plan = (budget: number | null, everyBudget?: PathStep[]) => buildPath({
      ...input([spec(serpentine)]),
      frontiers: { [serpentine]: { ranged: curve } },
      buyCost: new Map([[FOR_SERPENTINE, 10e6], [BIG, 100e6]]),
      beam: { width: 4, branching: 4 },
      budget,
      everyBudget,
    });
    const gainAt = (budget: number) => gainWithin(plan(budget), budget);
    // Every budget at once: the cheap step first. At exactly 100M, the big one alone is better.
    expect(plan(null).steps.map((s) => s.buy)).toEqual([[FOR_SERPENTINE], [BIG]]);
    expect(gainAt(100e6)).toBeCloseTo(9 / 5 - 1);
    expect(plan(100e6).steps.map((s) => s.buy)).toEqual([[BIG], [FOR_SERPENTINE]]);
    expect(gainAt(50e6)).toBeCloseTo(6 / 5 - 1);

    // Planning another budget reuses the search for every budget at once, and plans the same.
    const { everyBudget } = plan(null);
    expect(everyBudget).toEqual(plan(null).steps);
    expect(plan(100e6, everyBudget).steps).toEqual(plan(100e6).steps);
  });

  it('tells small budgets apart', () => {
    expect(averageGain([{ totalSpent: 10e3, gain: 0.1 }], 1e6)).toBeGreaterThan(averageGain([{ totalSpent: 500e3, gain: 0.1 }], 1e6));
  });
});

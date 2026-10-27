import { describe, expect, it } from 'vitest';
import { allMonsters, buildMonster, monsterKey, playerContext } from '../build-player';
import { itemById } from '../items';
import {
  buildPool, Evaluator, loadoutCost, optimize, Penalized, toRef,
} from '../optimizer';
import { FAMILIES } from '../types';
import { maxedSettings, sampleOwnedIds } from './fixtures';

const owned = sampleOwnedIds().map((id) => itemById(id)!);
const key = (name: string) => monsterKey(allMonsters.find((m) => m.name === name)!);
const describeRef = (r: ReturnType<typeof toRef>) => `${Object.entries(r.equipment).map(([, id]) => itemById(id)!.name).join(', ')} | ${r.styleName}/${r.styleStance} ${r.spell ?? ''}`;

describe('optimizer', () => {
  it.each(['Vorkath', 'General Graardor', 'Abyssal demon'])('finds a sane best loadout vs %s', (name) => {
    const monster = buildMonster(key(name));
    for (const family of FAMILIES) {
      const ev = new Evaluator(playerContext(family, maxedSettings, name === 'Abyssal demon', monster));
      const pool = buildPool(owned, family, maxedSettings);
      const t = performance.now();
      const best = optimize(pool, ev);
      console.log(name, family, best?.score.toFixed(3), `${ev.calcs} calcs ${(performance.now() - t).toFixed(0)}ms`, best && describeRef(toRef(best.state)));
      expect(best?.score ?? 0).toBeGreaterThan(0);
    }
  });

  it("only buys a twisted bow for Kree'arra when gp is cheap", () => {
    const monster = buildMonster(key("Kree'arra"));
    const ev = new Evaluator(playerContext('ranged', maxedSettings, false, monster));
    const tbow = itemById(20997)!;
    const costOf = (p: typeof tbow) => (p.id === tbow.id ? 1.5e9 : 0);
    const pool = buildPool([...owned, tbow], 'ranged', maxedSettings, costOf);
    const stingy = optimize(pool, new Penalized(ev, costOf, 1e-6))!;
    const generous = optimize(pool, new Penalized(ev, costOf, 1e-12))!;
    console.log('stingy', describeRef(toRef(stingy.state)), '| generous', describeRef(toRef(generous.state)));
    expect(loadoutCost(stingy.state, costOf)).toBe(0);
    expect(generous.state.equipment.weapon?.id).toBe(tbow.id);
  });
});

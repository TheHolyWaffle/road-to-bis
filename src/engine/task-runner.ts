import { buildMonster, type LoadoutState, playerContext } from './build-player';
import { type EquipmentPiece, isDefined, type Monster } from './dps-calc';
import { itemById } from './items';
import {
  ascend, bestWeaponSetup, buildPool, type CostOf, Evaluator, fromRef, loadoutCost, optimize, Penalized, type Pool,
  type Scored, toRef, wearing,
} from './optimizer';
import {
  type CombatSettings, type Family, type Frontier, type FrontierPoint, GEAR_SLOTS, type LoadoutRef, type MonsterSpec,
  type OptimizedLoadout,
} from './types';

export interface SearchContext {
  ownedIds: number[];
  settings: CombatSettings;
  monsters: MonsterSpec[];
  /** Items you could get, with their cost in gp. */
  candidates: [id: number, cost: number][];
}

interface TaskBase {
  monster: string;
  family: Family;
}

/** Trace how far gp takes one style at one monster. */
export interface FrontierTask extends TaskBase {
  kind: 'frontier';
}

/** Find the best loadout with each set of items bought for other monsters, so their value here is known too. */
export interface CrossTask extends TaskBase {
  kind: 'cross';
  baseline: LoadoutRef | null;
  itemSets: number[][];
}

export interface JointMember {
  monster: string;
  baseline: LoadoutRef | null;
  /** What a DPS more here is worth to the path's average speed-up, near your current gear. */
  weight: number;
}

/**
 * Choose items for every monster in one style at once, so an item that helps a little everywhere is valued by all of
 * its help, not just its best monster's.
 */
export interface JointTask {
  kind: 'joint';
  family: Family;
  members: JointMember[];
  /** Item sets from the cost curves, tried as one purchase since a set's pieces may only pay off together. */
  bundles: number[][];
  /** The weighted score with every monster in best in slot, which sets the gp penalty's scale. */
  scale: number;
}

export type Task = FrontierTask | CrossTask | JointTask;

export type TaskResult =
  | { kind: 'frontier'; result: Frontier; calcs: number }
  | { kind: 'cross'; result: FrontierPoint[]; calcs: number }
  | { kind: 'joint'; result: number[][]; calcs: number };

/**
 * Score given up per gp, as a fraction of the best-in-slot score per 10M gp. Each finds the best loadout for that
 * exchange rate, from "only if it's nearly free" to "anything that helps at all".
 */
const RATES = Array.from({ length: 16 }, (_, i) => 2 ** (1 - i));

const NO_LOADOUT: OptimizedLoadout = { loadout: null, dps: 0 };

/** Purchases the joint search re-checks with a full search at every monster, out of the best by a quick estimate. */
const JOINT_SHORTLIST = 4;
const JOINT_MAX_STEPS = 60;

const best = (...xs: (Scored | null)[]) => xs.reduce<Scored | null>((b, x) => (x && (!b || x.score > b.score) ? x : b), null);

export const createTaskRunner = (ctx: SearchContext) => {
  const owned = ctx.ownedIds.map(itemById).filter(isDefined);
  const costs = new Map(ctx.candidates);
  const candidates = ctx.candidates.map(([id]) => itemById(id)).filter(isDefined);
  const costOf: CostOf = (p: EquipmentPiece) => costs.get(p.id) ?? 0;
  const pools = new Map<string, Pool>();
  const pool = (key: string, f: Family, items: () => EquipmentPiece[]) => {
    const k = `${key}|${f}`;
    if (!pools.has(k)) pools.set(k, buildPool(items(), f, ctx.settings, costOf));
    return pools.get(k)!;
  };
  const specs = new Map(ctx.monsters.map((m) => [m.key, m]));
  const monsters = new Map<string, Monster>();
  const monster = (key: string) => {
    if (!monsters.has(key)) monsters.set(key, buildMonster(key, specs.get(key)?.scaling));
    return monsters.get(key)!;
  };
  // A monster and style's cross task revisits the loadouts its frontier task found, so they share an evaluator.
  const evaluators = new Map<string, Evaluator>();
  const evaluator = (key: string, family: Family) => {
    const k = `${key}|${family}`;
    if (!evaluators.has(k)) {
      const context = playerContext(family, ctx.settings, specs.get(key)?.onTask ?? false, monster(key));
      evaluators.set(k, new Evaluator(context));
    }
    return evaluators.get(k)!;
  };
  const totalCalcs = () => [...evaluators.values()].reduce((sum, ev) => sum + ev.calcs, 0);
  const ownedPool = (f: Family) => pool('owned', f, () => owned);

  const ownedIds = new Set(ctx.ownedIds);
  /** Items in the loadout that cost something, so leaving out free ones like imbues you can do anyway. */
  const bought = (st: LoadoutState) => GEAR_SLOTS
    .map((slot) => st.equipment[slot])
    .filter((p): p is EquipmentPiece => !!p && !ownedIds.has(p.id) && costOf(p) > 0);
  const keyOf = (items: EquipmentPiece[]) => items.map((i) => i.id).sort((a, b) => a - b).join(',');

  /** The best loadout using only what you own plus `items`, searched from `starts` and from your baseline. */
  const poolWith = (family: Family, items: EquipmentPiece[]) => {
    // Owned items another owned item beats stay beaten, so the owned pool's survivors stand in for everything owned.
    const { weapons, armour, ammo } = ownedPool(family);
    return buildPool([...weapons, ...Object.values(armour).flat(), ...ammo, ...items], family, ctx.settings, costOf);
  };
  const bestUsing = (
    family: Family,
    ev: Evaluator,
    baseline: LoadoutState | null,
    items: EquipmentPiece[],
    starts: LoadoutState[] = [],
    p = poolWith(family, items),
  ) => {
    if (!baseline) return optimize(p, ev);
    return best(ascend(wearing(baseline, items, p), ev, p), ...starts.map((st) => ascend(st, ev, p)));
  };

  /**
   * Build orders for a loadout, as nested loadouts between your own gear and it. Forwards: add whichever of its items
   * adds the most score per gp, starting from your gear. Backwards: drop whichever loses the least, starting from the
   * full loadout. Every loadout tried along the way is returned, so this also covers each item bought on its own.
   */
  const buildOrders = (family: Family, ev: Evaluator, baseline: LoadoutState | null, target: Scored, memo: Map<string, Scored | null>) => {
    const free = GEAR_SLOTS.map((slot) => target.state.equipment[slot]).filter((p): p is EquipmentPiece => !!p && !ownedIds.has(p.id) && costOf(p) === 0);
    const using = (items: EquipmentPiece[], from: LoadoutState[]) => {
      const key = keyOf(items);
      if (!memo.has(key)) memo.set(key, bestUsing(family, ev, baseline, [...free, ...items], from));
      return memo.get(key) ?? null;
    };
    const all = bought(target.state);
    const tried: Scored[] = [];

    let chosen: EquipmentPiece[] = [];
    let cur = baseline ? { state: baseline, score: ev.score(baseline) } : null;
    while (chosen.length < all.length - 1) {
      let next: { s: Scored; x: EquipmentPiece; value: number } | null = null;
      for (const x of all.filter((i) => !chosen.includes(i))) {
        const s = using([...chosen, x], cur ? [cur.state] : []);
        if (!s) continue;
        tried.push(s);
        const value = (s.score - (cur?.score ?? 0)) / Math.max(costOf(x), 1);
        if (!next || value > next.value) next = { s, x, value };
      }
      if (!next || next.value <= 0) break;
      chosen = [...chosen, next.x];
      cur = next.s;
    }

    let back = target;
    for (let items = all; items.length > 1; items = bought(back.state)) {
      let next: { s: Scored; loss: number } | null = null;
      for (const x of items) {
        const s = using(items.filter((i) => i !== x), x.slot === 'weapon' ? [] : [{ ...back.state, equipment: { ...back.state.equipment, [x.slot]: null } }]);
        if (!s) continue;
        tried.push(s);
        const loss = (back.score - s.score) / Math.max(costOf(x), 1);
        if (!next || loss < next.loss) next = { s, loss };
      }
      if (!next || loadoutCost(next.s.state, costOf) >= loadoutCost(back.state, costOf)) break;
      back = next.s;
    }
    return tried;
  };

  const point = (ev: Evaluator, st: LoadoutState): FrontierPoint => ({ loadout: toRef(st), ...ev.report(st), cost: loadoutCost(st, costOf) });
  /** Whether `score` beats `than` by more than rounding. */
  const beats = (score: number, than: number) => score > than * (1 + 1e-6) + 1e-9;

  const frontier = (task: FrontierTask, ev: Evaluator): Frontier => {
    const fullPool = pool('all', task.family, () => [...owned, ...candidates]);
    const baseline = optimize(ownedPool(task.family), ev);
    const bis = best(optimize(fullPool, ev), baseline && optimize(fullPool, ev, { start: baseline.state }));
    if (!bis) return { baseline: NO_LOADOUT, points: [] };

    // Sweeping from stingy to generous, each search starts from the previous answer and from what you own, since
    // slot-by-slot ascent only finds a local optimum.
    const found: LoadoutState[] = [];
    let prev = baseline?.state ?? bis.state;
    for (const rate of RATES) {
      const scorer = new Penalized(ev, costOf, (bis.score * rate) / 1e7);
      const starts = new Set([prev, baseline?.state, bis.state].filter(isDefined));
      const s = best(...[...starts].map((start) => optimize(fullPool, scorer, { start })));
      if (s) {
        found.push(s.state);
        prev = s.state;
      }
    }
    found.push(bis.state);

    // Keep the loadouts where paying more buys more score.
    const curve: Scored[] = [];
    let top = baseline?.score ?? 0;
    for (const { state, score } of found
      .map((st) => ({ state: st, score: ev.score(st), cost: loadoutCost(st, costOf) }))
      .sort((a, b) => a.cost - b.cost || b.score - a.score)) {
      if (!beats(score, top)) continue;
      top = score;
      curve.push({ state, score });
    }

    const memo = new Map<string, Scored | null>();
    const steps = new Map<string, Scored>();
    for (const s of curve) {
      for (const b of buildOrders(task.family, ev, baseline?.state ?? null, s, memo)) steps.set(JSON.stringify(toRef(b.state)), b);
    }
    return {
      baseline: baseline ? { loadout: toRef(baseline.state), ...ev.report(baseline.state) } : NO_LOADOUT,
      points: curve.map((s) => point(ev, s.state)),
      alternatives: [...steps.values()].filter((b) => b.score > (baseline?.score ?? 0)).map((b) => point(ev, b.state)),
    };
  };

  const cross = (task: CrossTask, ev: Evaluator): FrontierPoint[] => {
    const baseline = task.baseline ? fromRef(task.baseline, ownedPool(task.family)) : null;
    const baseScore = baseline ? ev.score(baseline) : 0;
    const seen = new Set<string>();
    const points: FrontierPoint[] = [];
    for (const ids of task.itemSets) {
      const s = bestUsing(task.family, ev, baseline, ids.map(itemById).filter(isDefined), baseline ? [baseline] : []);
      if (!s || !beats(s.score, baseScore)) continue;
      const key = JSON.stringify(toRef(s.state));
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point(ev, s.state));
    }
    return points;
  };

  /**
   * Greedily buys whatever adds the most weighted score across all the monsters, less a gp penalty swept from stingy to
   * generous as on a cost curve. Returns what's held after every purchase, for the cross checks to value everywhere.
   */
  const joint = (task: JointTask): number[][] => {
    const { family } = task;
    const fullPool = pool('all', family, () => [...owned, ...candidates]);
    const members = task.members.map((m) => {
      const ev = evaluator(m.monster, family);
      const baseline = m.baseline ? fromRef(m.baseline, ownedPool(family)) : null;
      const current: Scored | null = baseline && { state: baseline, score: ev.score(baseline) };
      // Quick estimates by option, valid while `current` is what they were made against.
      return {
        ev, weight: m.weight, baseline, current, quickFor: current, quick: new Map<string, number>(),
      };
    });
    type Member = typeof members[number];
    const buyable = [...fullPool.weapons, ...Object.values(fullPool.armour).flat()]
      .filter((p) => !ownedIds.has(p.id) && costOf(p) > 0)
      .map((p) => [p]);
    const bundles = task.bundles
      .map((ids) => ids.map(itemById).filter(isDefined))
      .filter((b) => b.length > 1);
    const gain = (m: Member, score: number) => m.weight * (score - (m.current?.score ?? 0));

    let chosen: EquipmentPiece[] = [];
    const found = new Map<string, number[]>();
    /** A lower bound on what wearing `extra` adds at a monster: put on as is, re-picking only the weapon's setup. */
    const quick = (m: Member, key: string, extra: EquipmentPiece[]) => {
      if (!m.current) return 0;
      if (m.quickFor !== m.current) {
        m.quickFor = m.current;
        m.quick.clear();
      }
      if (!m.quick.has(key)) {
        const st = wearing(m.current.state, extra, fullPool);
        const s = extra.some((p) => p.slot === 'weapon') ? bestWeaponSetup(st, m.ev, fullPool)?.score ?? 0 : m.ev.score(st);
        m.quick.set(key, Math.max(0, gain(m, s)));
      }
      return m.quick.get(key)!;
    };
    // Full searches by option, valid until the next purchase.
    const fullMemo = new Map<string, (Scored | null)[]>();
    const full = (key: string, extra: EquipmentPiece[]) => {
      if (!fullMemo.has(key)) {
        const p = poolWith(family, [...chosen, ...extra]);
        fullMemo.set(key, members.map((m) => {
          const starts = m.current ? [m.current.state, wearing(m.current.state, extra, fullPool)] : [];
          return best(m.current, bestUsing(family, m.ev, m.baseline, [...chosen, ...extra], starts, p));
        }));
      }
      return fullMemo.get(key)!;
    };

    for (const rate of RATES) {
      const lambda = (task.scale * rate) / 1e7;
      for (let n = 0; n < JOINT_MAX_STEPS; n++) {
        const held = new Set(chosen.map((p) => p.id));
        const options = [...buyable, ...bundles]
          .map((b) => b.filter((p) => !held.has(p.id)))
          .filter((b) => b.length)
          .map((extra) => {
            const key = keyOf(extra);
            const penalty = lambda * extra.reduce((sum, p) => sum + costOf(p), 0);
            return { extra, key, penalty, value: members.reduce((sum, m) => sum + quick(m, key, extra), 0) - penalty };
          })
          .sort((a, b) => b.value - a.value)
          .slice(0, JOINT_SHORTLIST);
        let pick: { extra: EquipmentPiece[]; value: number; states: (Scored | null)[] } | null = null;
        for (const { extra, key, penalty } of options) {
          const states = full(key, extra);
          const value = members.reduce((sum, m, i) => sum + gain(m, states[i]?.score ?? 0), 0) - penalty;
          if (value > 0 && (!pick || value > pick.value)) pick = { extra, value, states };
        }
        if (!pick) break;
        members.forEach((m, i) => { m.current = pick.states[i]; });
        fullMemo.clear();
        // Whatever a later purchase replaced everywhere isn't kept.
        const worn = new Set(members.flatMap((m) => (m.current ? bought(m.current.state).map((p) => p.id) : [])));
        chosen = [...chosen, ...pick.extra].filter((p) => worn.has(p.id));
        found.set(keyOf(chosen), chosen.map((p) => p.id));
      }
    }
    return [...found.values()];
  };

  return (task: Task): TaskResult => {
    const calcsBefore = totalCalcs();
    const calcs = () => totalCalcs() - calcsBefore;
    switch (task.kind) {
      case 'frontier': return { kind: 'frontier', result: frontier(task, evaluator(task.monster, task.family)), calcs: calcs() };
      case 'cross': return { kind: 'cross', result: cross(task, evaluator(task.monster, task.family)), calcs: calcs() };
      case 'joint': return { kind: 'joint', result: joint(task), calcs: calcs() };
    }
  };
};

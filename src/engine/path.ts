import { fullHp } from './build-player';
import {
  type Family, fightsOf, type Frontier, gearIds, type LoadoutRef, type MonsterSpec, type OptimizedLoadout,
} from './types';

export interface PathInput {
  monsters: MonsterSpec[];
  /** monster key -> style -> cost curve */
  frontiers: Record<string, Partial<Record<Family, Frontier>>>;
  ownedIds: number[];
  /** gp to get each item you don't own. */
  buyCost: Map<number, number>;
  /** GE price of each tradeable item, owned or not; anything missing can't be sold. */
  resale: Map<number, number>;
  /** Owned items that making an item uses up, e.g. the ring an imbued ring is made from. */
  consumes: Map<number, number[]>;
  /** Sell gear once no style at any monster uses it any more. */
  sell: boolean;
  /**
   * Search several paths at once instead of always taking the best step: from each of the `width` best paths so far,
   * try its `branching` best steps, finishing each greedily to score it.
   */
  beam?: { width: number; branching: number };
}

export interface EncounterState {
  monster: string;
  family: Family | null;
  /** DPS. */
  score: number;
  loadout: LoadoutRef | null;
}

export interface PathStep {
  /** Items bought in this step; several only when none of them pays off without the others. */
  buy: number[];
  /** What each of `buy` costs. */
  costs: number[];
  sell: number[];
  /** Owned items that making a bought one uses up. */
  consumed: number[];
  /** gp spent on `buy`, and got back for `sell` after GE tax. */
  spent: number;
  refunded: number;
  /** Net gp spent from the start of the path up to and including this step. */
  totalSpent: number;
  /** Weighted mean of how much faster each fight is than at the start, e.g. 0.12 for 12%. */
  gain: number;
  /** The monster and style whose next loadout this step buys. */
  target: { monster: string; family: Family };
  states: EncounterState[];
}

/** A fight: one monster, or the phases of one boss or raid, which are scored together by the time a kill takes. */
export interface Encounter {
  name: string;
  /** Indices into the monsters, and so into each list of states. */
  phases: number[];
  weight: number;
}

/** What a phase's kill time follows from. */
export interface PhaseTiming {
  /** The monster's full HP, and the share of it this phase takes. */
  hp: number;
  share: number;
  /** The best score any setup the search found gets here. */
  top: number;
}

export interface Path {
  encounters: Encounter[];
  phases: PhaseTiming[];
  start: EncounterState[];
  steps: PathStep[];
  /** The best loadout at each monster with every item owned. */
  bis: EncounterState[];
}

interface Option extends EncounterState {
  family: Family;
  /** Equipment ids, leaving out ammo since it's a consumable. */
  items: number[];
}

const GE_TAX = 0.02;
const GE_TAX_CAP = 5_000_000;
export const afterTax = (price: number) => price - Math.min(Math.floor(price * GE_TAX), GE_TAX_CAP);

const EPS = 1e-9;
/**
 * A phase you can't damage yet counts as taking this many times as long as it would in best in slot, which keeps the
 * fight's kill time finite.
 */
export const SLOWEST = 10;

const strip = ({
  monster, family, score, loadout,
}: EncounterState): EncounterState => ({
  monster, family, score, loadout,
});

/**
 * Orders purchases from your current gear to best in slot. Each step buys whatever moves one monster to a better
 * loadout, choosing the step that adds the most (weighted, relative) speed across all monsters per gp. A step can be
 * one item or several that only pay off together, like switching style or completing a set.
 */
export const buildPath = (input: PathInput): Path => {
  const { monsters } = input;
  const encounters: Encounter[] = fightsOf(monsters).map(({ name, phases }) => ({ name, phases, weight: monsters[phases[0]].weight }));
  const totalWeight = encounters.reduce((s, e) => s + e.weight, 0) || 1;
  const toOptions = (m: MonsterSpec, family: Family, loadouts: OptimizedLoadout[]): Option[] => loadouts
    .filter((p): p is OptimizedLoadout & { loadout: LoadoutRef } => !!p.loadout)
    .map((p) => ({
      monster: m.key, family, score: p.dps, loadout: p.loadout, items: gearIds(p.loadout),
    }))
    .sort((a, b) => b.score - a.score);
  /** monster -> style -> the chosen loadouts, best first */
  const perFamily = (loadouts: (f: Frontier) => OptimizedLoadout[]) => monsters.map((m) => m.families.map((family) => {
    const f = input.frontiers[m.key]?.[family];
    return f ? toOptions(m, family, loadouts(f)) : [];
  }));
  const options = perFamily((f) => [f.baseline, ...f.points, ...(f.alternatives ?? [])]);
  // Just the cost curves: the loadouts each style is heading for.
  const curves = perFamily((f) => [f.baseline, ...f.points]);

  const where = new Map(options.flatMap((byFamily, i) => byFamily.flatMap((opts, f) => opts.map((o) => [o, [i, f] as const]))));

  /** Each style's best loadout at monster `i` with the items held. */
  const bestWith = (i: number, held: Set<number>) => options[i].map((opts) => opts.find((o) => o.items.every((id) => held.has(id))) ?? null);
  const bestOverall = (i: number, perFamily: (Option | null)[]): EncounterState => perFamily.reduce<EncounterState>(
    (b, o) => (o && o.score > b.score ? o : b),
    {
      monster: monsters[i].key, family: null, score: 0, loadout: null,
    },
  );
  const overall = (states: (Option | null)[][]) => states.map((s, i) => bestOverall(i, s));
  // Gear stays while any style at any monster still wears it, so you keep a working setup for every style.
  const inUse = (states: (Option | null)[][]) => new Set(states.flat().flatMap((o) => o?.items ?? []));
  // Gear also stays while a better loadout on a cost curve uses it, rather than being sold and bought back later.
  const stillNeeded = (states: (Option | null)[][], used: Set<number>) => {
    const ids = new Set(used);
    curves.forEach((byFamily, i) => byFamily.forEach((curve, f) => {
      for (const o of curve) {
        if (o.score <= (states[i][f]?.score ?? 0) + EPS) break;
        o.items.forEach((id) => ids.add(id));
      }
    }));
    return ids;
  };

  const phases = monsters.map((m, i) => phaseTiming(m, options[i].flat().map((o) => o.score)));
  const timing = { encounters, phases };
  const seconds = (states: EncounterState[]) => killSeconds(timing, states);

  const held = new Set(input.ownedIds);
  const current = monsters.map((_, i) => bestWith(i, held));
  const start = overall(current).map(strip);
  const startSeconds = seconds(start);
  // Each fight counts by how much faster it gets, so a slow kill matters as much as a fast one.
  const gainOf = (states: EncounterState[]) => seconds(states)
    .reduce((sum, t, e) => sum + (t > 0 ? encounters[e].weight * (startSeconds[e] / t - 1) : 0), 0) / totalWeight;

  type Move = Omit<PathStep, 'totalSpent' | 'states'> & { net: number; ratio: number; next: (Option | null)[][] };
  /**
   * Whether `a` is a better step than `b`. Steps that cost nothing after sales come first, by speed added and then by
   * gp made; the rest by speed added per gp.
   */
  const better = (a: Move, b: Move) => {
    if ((a.net <= 0) !== (b.net <= 0)) return a.net <= 0;
    const [x, y] = a.net <= 0 ? [a.gain, b.gain] : [a.ratio, b.ratio];
    if (Math.abs(x - y) > EPS) return x > y;
    return a.net <= 0 ? a.net < b.net : a.gain > b.gain;
  };

  interface Progress {
    held: Set<number>;
    /** Only gear the path has worn is ever sold; whatever else is in your bank may be for content not modelled here. */
    worn: Set<number>;
    current: (Option | null)[][];
    gain: number;
    totalSpent: number;
    steps: PathStep[];
  }

  /**
   * Every step that adds speed, best first. With `within`, only steps that buy some of those items; with `proper` as
   * well, not all of them at once.
   */
  const ids = (set: Set<number>) => [...set].sort((x, y) => x - y).join(',');
  // What you hold and have worn decides every step from here; only the gp spent so far differs.
  const keyOf = (p: Progress) => `${ids(p.held)}|${ids(p.worn)}`;
  const movesCache = new Map<string, Move[]>();
  const movesFrom = (p: Progress, within: Set<number> | null = null, proper = false): Move[] => {
    const cacheKey = `${keyOf(p)}|${within ? ids(within) : '*'}|${proper}`;
    if (!movesCache.has(cacheKey)) movesCache.set(cacheKey, findMoves(p, within, proper));
    return movesCache.get(cacheKey)!;
  };
  const findMoves = (p: Progress, within: Set<number> | null, proper: boolean): Move[] => {
    const moves: Move[] = [];
    const tried = new Set<string>();
    const missingOf = new Map(options.flat(2).map((o) => [o, o.items.filter((id) => !p.held.has(id)).sort((a, b) => a - b)]));
    // Loadouts by exactly what they lack, so a purchase finds the ones it completes without checking them all.
    const byMissing = new Map<string, Option[]>();
    for (const [o, lacks] of missingOf) {
      const key = lacks.join(',');
      if (!byMissing.has(key)) byMissing.set(key, []);
      byMissing.get(key)!.push(o);
    }
    /** The best loadout each style gets with `buy` as well. A loadout has at most 11 items, so `buy` has few subsets. */
    const after = (buy: number[]) => {
      const next = p.current.map((s) => [...s]);
      for (let subset = 1; subset < 2 ** buy.length; subset++) {
        for (const o of byMissing.get(buy.filter((_, k) => subset & (1 << k)).join(',')) ?? []) {
          const [i, f] = where.get(o)!;
          if (o.score > (next[i][f]?.score ?? -Infinity)) next[i][f] = o;
        }
      }
      return next;
    };
    for (const [i, byFamily] of options.entries()) {
      const now = bestOverall(i, p.current[i]);
      for (const o of byFamily.flat()) {
        if (o.score <= now.score + EPS) continue;
        const missing = missingOf.get(o)!;
        const key = missing.join(',');
        if (!missing.length || tried.has(key)) continue;
        tried.add(key);
        if (within && (missing.some((id) => !within.has(id)) || (proper && missing.length >= within.size))) continue;

        const next = after(missing);
        const gain = gainOf(overall(next));
        if (gain <= p.gain + EPS) continue;

        const used = inUse(next);
        // Another monster's better loadout can make part of the bundle unnecessary.
        const buy = missing.filter((id) => used.has(id));
        const costs = buy.map((id) => input.buyCost.get(id) ?? input.resale.get(id) ?? Infinity);
        const spent = costs.reduce((sum, c) => sum + c, 0);
        if (!Number.isFinite(spent)) continue;
        const consumed = new Set(buy.flatMap((id) => input.consumes.get(id) ?? []));
        if ([...consumed].some((id) => used.has(id))) continue;
        const needed = input.sell ? stillNeeded(next, used) : used;
        const sell = input.sell ? [...p.worn].filter((id) => p.held.has(id) && !needed.has(id) && !consumed.has(id) && input.resale.has(id)) : [];
        const refunded = sell.reduce((sum, id) => sum + afterTax(input.resale.get(id)!), 0);
        const net = spent - refunded;
        moves.push({
          // Per billion gp, so ratios aren't so small that EPS swallows the differences.
          buy, costs, sell, consumed: [...consumed], spent, refunded, net, ratio: ((gain - p.gain) * 1e9) / net, gain, next, target: { monster: o.monster, family: o.family },
        });
      }
    }
    return moves.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  };
  const bestMove = (p: Progress, within: Set<number> | null = null, proper = false): Move | null => movesFrom(p, within, proper)[0] ?? null;

  const take = (p: Progress, {
    net, ratio, next, ...step
  }: Move): Progress => {
    const nowHeld = new Set([...p.held, ...step.buy]);
    [...step.sell, ...step.consumed].forEach((id) => nowHeld.delete(id));
    const totalSpent = p.totalSpent + net;
    return {
      held: nowHeld,
      worn: new Set([...p.worn, ...step.buy]),
      current: next,
      gain: step.gain,
      totalSpent,
      steps: [...p.steps, { ...step, totalSpent, states: overall(next).map(strip) }],
    };
  };
  // A bundle is bought in the smallest parts that each pay off on their own, so you can stop part way, and only items
  // that are worthless without each other stay together.
  const advance = (p: Progress, move: Move): Progress => {
    let rest = new Set(move.buy);
    for (let part = bestMove(p, rest, true); part; part = bestMove(p, rest, true)) {
      p = take(p, part);
      const { held: nowHeld } = p;
      rest = new Set([...rest].filter((id) => !nowHeld.has(id)));
    }
    const remainder = rest.size ? bestMove(p, rest) : null;
    return remainder ? take(p, remainder) : p;
  };
  const completions = new Map<string, { from: number; steps: PathStep[]; end: Progress }>();
  /** Follows the best step from `p` until nothing adds speed. */
  const complete = (p: Progress): Progress => {
    const key = keyOf(p);
    if (!completions.has(key)) {
      let end = p;
      for (let move = bestMove(end); move; move = bestMove(end)) {
        const next = advance(end, move);
        if (next === end) break;
        end = next;
      }
      completions.set(key, { from: p.totalSpent, steps: end.steps.slice(p.steps.length), end });
    }
    const { from, steps, end } = completions.get(key)!;
    const shift = p.totalSpent - from;
    const rest = steps.map((s) => ({ ...s, totalSpent: s.totalSpent + shift }));
    return {
      ...end, totalSpent: end.totalSpent + shift, steps: [...p.steps, ...rest],
    };
  };

  const begin: Progress = {
    held, worn: inUse(current), current, gain: 0, totalSpent: 0, steps: [],
  };
  let best = complete(begin);
  if (input.beam) {
    const horizon = Math.max(0, ...best.steps.map((s) => s.totalSpent));
    const score = (p: Progress) => averageGain(p.steps, horizon);
    let beam = [begin];
    while (beam.length) {
      const children = new Map<string, { at: Progress; end: Progress }>();
      for (const p of beam) {
        for (const move of movesFrom(p).slice(0, input.beam.branching)) {
          const at = advance(p, move);
          if (at === p) continue;
          const end = complete(at);
          const key = keyOf(at);
          if (!children.has(key) || score(end) > score(children.get(key)!.end)) children.set(key, { at, end });
        }
      }
      const ranked = [...children.values()].sort((a, b) => score(b.end) - score(a.end));
      if (ranked.length && score(ranked[0].end) > score(best) + EPS) best = ranked[0].end;
      beam = ranked.slice(0, input.beam.width).map((c) => c.at);
    }
  }

  const everything = new Set(options.flat(2).flatMap((o) => o.items));
  return {
    ...timing, start, steps: best.steps, bis: monsters.map((_, i) => strip(bestOverall(i, bestWith(i, everything)))),
  };
};

/** Budgets below this count as this, so the log scale below has somewhere to start. */
const SMALLEST_BUDGET = 1e6;

/**
 * Mean gain over budgets up to `horizon` gp on a log scale, so every doubling of the budget counts the same: a path
 * scores well by being fast at 10M as much as at 1B.
 */
export const averageGain = (steps: Pick<PathStep, 'totalSpent' | 'gain'>[], horizon: number) => {
  if (horizon <= SMALLEST_BUDGET) return steps.length ? steps.at(-1)!.gain : 0;
  const at = (gp: number) => Math.log(Math.min(Math.max(gp, SMALLEST_BUDGET), horizon));
  let area = 0;
  let from = at(0);
  let gain = 0;
  for (const s of steps) {
    // A step is in budget once every step up to it is.
    const to = Math.max(from, at(s.totalSpent));
    area += gain * (to - from);
    from = to;
    gain = s.gain;
  }
  return (area + gain * (at(horizon) - from)) / (at(horizon) - at(0));
};

/** A monster's phase timing, given the scores of the setups found for it. */
export const phaseTiming = (m: MonsterSpec, scores: number[]): PhaseTiming => {
  const hp = fullHp(m.key, m.scaling);
  return { hp, share: hp > 0 ? (m.hp ?? hp) / hp : 0, top: Math.max(0, ...scores) };
};

/** Seconds per kill of a phase at `score`. */
export const phaseSeconds = ({ hp, share, top }: PhaseTiming, score: number) => {
  // No setup can damage it, so there's nothing to speed up.
  if (!top || !share) return 0;
  return (share * hp) / Math.max(score, top / SLOWEST);
};

/** Seconds per kill of each encounter, for states like `start` or a step's. */
export const killSeconds = ({ encounters, phases }: Pick<Path, 'encounters' | 'phases'>, states: EncounterState[]) => encounters
  .map((e) => e.phases.reduce((sum, i) => sum + phaseSeconds(phases[i], states[i].score), 0));

/** The setups after the first `n` steps. */
export const statesAfter = (path: Path, n: number) => (n > 0 ? path.steps[n - 1].states : path.start);

/** How many steps of the path fit in `budget` gp, net of sales. */
export const stepsWithin = (path: Path, budget: number | null) => {
  const over = budget === null ? -1 : path.steps.findIndex((s) => s.totalSpent > budget);
  return over === -1 ? path.steps.length : over;
};

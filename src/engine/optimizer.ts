import {
  BLOWPIPE_IDS, EquipmentCategory, getCombatStylesForCategory, getDefaultCombatStyle, PlayerVsNPCCalc, SECONDS_PER_TICK, spellByName,
} from './dps-calc';
import type {
  EquipmentPiece, Monster, PlayerEquipment, Spell,
} from './dps-calc';
import {
  buildPlayer, type LoadoutState, type PlayerContext, scaledHp,
} from './build-player';
import { emptyEquipment } from './empty-player';
import { damageTakenPerSecond, tripStats } from './survival';
import {
  ammoFitsWeapon, dominates, familyStats, isRelevant, isSpecial, itemById, representatives,
  stylesForFamily, weaponFamilies, weaponNeedsAmmo,
} from './items';
import { GEAR_SETS } from './sets';
import { candidateSpells } from './spells';
import {
  type CombatSettings, type Family, GEAR_SLOTS, type LoadoutRef, type Objective, SLOTS, type Slot,
} from './types';

const ARMOUR_SLOTS = ['head', 'cape', 'neck', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'] as const;
type ArmourSlot = typeof ARMOUR_SLOTS[number];

export interface Pool {
  family: Family;
  settings: CombatSettings;
  weapons: EquipmentPiece[];
  armour: Record<ArmourSlot, EquipmentPiece[]>;
  ammo: EquipmentPiece[];
  dart: EquipmentPiece | null;
}

/** Anything the search can maximise: an Evaluator, or one penalised by cost. */
export interface Scorer {
  score(st: LoadoutState): number;
}

export interface Scored {
  state: LoadoutState;
  /** DPS or kills per hour, depending on the evaluator's objective. */
  score: number;
}

const isDart = (e: EquipmentPiece) => / dart$/i.test(e.name) && e.bonuses.ranged_str > 0;
const ANY_AMMO = representatives.filter((e) => e.slot === 'ammo' && (e.bonuses.ranged_str > 0 || isSpecial(e)));
const ANY_DARTS = representatives.filter(isDart);

const isSpecialAmmo = (e: EquipmentPiece) => isSpecial(e) || e.name.includes('(e)');

/** gp it takes to get an item; owned items cost nothing. */
export type CostOf = (piece: EquipmentPiece) => number;

const free: CostOf = () => 0;

/**
 * Drops items that another candidate beats on every stat relevant to the family without costing more. Special items
 * always survive.
 */
export const paretoPrune = (items: EquipmentPiece[], family: Family, special = isSpecial, cost = free) => {
  const plain = items.filter((i) => !special(i));
  const stats = plain.map((i) => [...familyStats(i, family), -cost(i)]);
  const kept = plain.filter((_, a) => !stats.some((s, b) => b !== a
    && (dominates(s, stats[a]) || (b < a && s.every((v, k) => v === stats[a][k])))));
  return [...kept, ...items.filter(special)];
};

const withDart = (weapon: EquipmentPiece, dart: EquipmentPiece | null): EquipmentPiece => (
  dart && BLOWPIPE_IDS.includes(weapon.id)
    ? { ...weapon, itemVars: { blowpipeDartId: dart.id, blowpipeDartName: dart.name } }
    : weapon
);

const uniqueById = (items: EquipmentPiece[]) => [...new Map(items.map((i) => [i.id, i])).values()];

/** Drops weapons another weapon of the same kind beats on stats and speed without costing more. */
const pruneWeapons = (weapons: EquipmentPiece[], family: Family, cost: CostOf) => {
  const plain = weapons.filter((w) => !isSpecial(w));
  const stats = plain.map((w) => [...familyStats(w, family), -w.speed, -cost(w)]);
  const kept = plain.filter((w, a) => !plain.some((o, b) => b !== a
    && o.category === w.category
    && (!o.isTwoHanded || w.isTwoHanded)
    && (dominates(stats[b], stats[a]) || (b < a && stats[b].every((v, k) => v === stats[a][k])))));
  return [...kept, ...weapons.filter(isSpecial)];
};

export const buildPool = (items: EquipmentPiece[], family: Family, settings: CombatSettings, cost = free): Pool => {
  const darts = [...items.filter(isDart), ...(settings.anyAmmo ? ANY_DARTS : [])];
  const dart = darts.reduce<EquipmentPiece | null>((b, d) => (!b || d.bonuses.ranged_str > b.bonuses.ranged_str ? d : b), null);
  const armour = Object.fromEntries(ARMOUR_SLOTS.map((slot) => [
    slot,
    paretoPrune(uniqueById(items.filter((i) => i.slot === slot && isRelevant(i, family))), family, isSpecial, cost),
  ])) as Pool['armour'];
  return {
    family,
    settings,
    weapons: pruneWeapons(uniqueById(items.filter((i) => i.slot === 'weapon' && weaponFamilies(i).includes(family))), family, cost)
      .map((w) => withDart(w, dart)),
    armour,
    ammo: family === 'ranged'
      ? uniqueById([...items.filter((i) => i.slot === 'ammo'), ...(settings.anyAmmo ? ANY_AMMO : [])])
      : [],
    dart,
  };
};

const stateKey = (st: LoadoutState) => `${SLOTS.map((s) => st.equipment[s]?.id ?? '').join(',')}|${st.style.name}/${st.style.stance}|${st.spell?.name ?? ''}`;

/**
 * Average DPS over a whole kill from the engine's time-to-kill distribution, which follows the monster's HP down so
 * HP-dependent effects like ruby bolt procs shrink as they would in a real kill. Returns null when the distribution is
 * cut off before most kills finish, since the average would then be too optimistic.
 */
const killTimeDps = (calc: PlayerVsNPCCalc): number | null => {
  let total = 0;
  let expectedTicks = 0;
  for (const [ticks, p] of calc.getTtkDistribution()) {
    total += p;
    expectedTicks += ticks * p;
  }
  if (total < 0.99 || expectedTicks <= 0) return null;
  // The calculator keeps its (possibly raid-scaled) monster protected; the starting HP has to come from that one.
  const { monster } = calc as unknown as { monster: Monster };
  return monster.inputs.monsterCurrentHp / ((expectedTicks / total) * SECONDS_PER_TICK);
};

export interface Reported {
  dps: number;
  killsPerHour: number;
  killsPerTrip: number;
  damagePerKill: number;
}

export class Evaluator implements Scorer {
  private cache = new Map<string, number>();

  private takenCache = new Map<string, number>();

  /** Whole-kill results, which only the loadouts the search reports need. */
  private exactCache = new Map<string, number>();

  private readonly fullHpMonster: Monster;

  private readonly hp: number;

  calcs = 0;

  constructor(readonly ctx: PlayerContext, readonly objective: Objective = 'dps') {
    this.fullHpMonster = { ...ctx.monster, inputs: { ...ctx.monster.inputs, monsterCurrentHp: ctx.monster.skills.hp } };
    this.hp = scaledHp(ctx.monster);
  }

  /** What the search maximises. */
  score(st: LoadoutState): number {
    if (this.objective === 'dps') return this.dps(st);
    return tripStats(this.dps(st), this.damageTaken(st), this.hp, this.ctx.settings).killsPerHour;
  }

  private static memo(cache: Map<string, number>, st: LoadoutState, compute: () => number, fallback: () => number): number {
    const key = stateKey(st);
    let v = cache.get(key);
    if (v === undefined) {
      try {
        v = compute();
      } catch {
        v = fallback();
      }
      cache.set(key, v);
    }
    return v;
  }

  private damageTaken(st: LoadoutState): number {
    return Evaluator.memo(this.takenCache, st, () => damageTakenPerSecond(buildPlayer(st, this.ctx), this.ctx.monster), () => 0);
  }

  /** Everything shown for a found loadout, with DPS from reportedDps(). */
  report(st: LoadoutState): Reported {
    const dps = this.reportedDps(st);
    return { dps, ...tripStats(dps, this.damageTaken(st), this.hp, this.ctx.settings) };
  }

  /** Fast DPS, with HP-dependent effects taken at half the monster's HP. Used while searching. */
  dps(st: LoadoutState): number {
    return Evaluator.memo(this.cache, st, () => {
      this.calcs++;
      const v = new PlayerVsNPCCalc(buildPlayer(st, this.ctx), this.ctx.monster).getDps();
      return Number.isFinite(v) ? v : 0;
    }, () => 0);
  }

  /**
   * The DPS to report for a found loadout. With exact kill time on, HP-dependent setups are re-scored by simulating
   * whole kills from full HP; that's far too slow to do for every loadout the search tries.
   */
  reportedDps(st: LoadoutState): number {
    if (!this.ctx.settings.exactKillTime) return this.dps(st);
    return Evaluator.memo(this.exactCache, st, () => {
      const player = buildPlayer(st, this.ctx);
      const calc = new PlayerVsNPCCalc(player, this.fullHpMonster);
      return (calc.distIsCurrentHpDependent(player, this.fullHpMonster) ? killTimeDps(calc) : null) ?? this.dps(st);
    }, () => this.dps(st));
  }
}

/** Score minus `lambda` per gp of the loadout's cost, so a sweep over lambda traces how score grows with spending. */
export class Penalized implements Scorer {
  constructor(private readonly ev: Scorer, private readonly costOf: CostOf, private readonly lambda: number) {}

  score(st: LoadoutState) {
    return this.ev.score(st) - this.lambda * loadoutCost(st, this.costOf);
  }
}

export const loadoutCost = (st: LoadoutState, costOf: CostOf) => GEAR_SLOTS.reduce((total, slot) => {
  const piece = st.equipment[slot];
  return piece ? total + costOf(piece) : total;
}, 0);

const EPS = 1e-9;

const ammoCache = new WeakMap<Pool, Map<number, (EquipmentPiece | null)[]>>();

const ammoOptions = (weapon: EquipmentPiece, pool: Pool): (EquipmentPiece | null)[] => {
  if (!weaponNeedsAmmo(weapon)) return [null];
  let byWeapon = ammoCache.get(pool);
  if (!byWeapon) ammoCache.set(pool, byWeapon = new Map());
  let options = byWeapon.get(weapon.id);
  if (!options) byWeapon.set(weapon.id, options = paretoPrune(pool.ammo.filter((a) => ammoFitsWeapon(weapon, a)), 'ranged', isSpecialAmmo));
  return options;
};

/** Picks the best style, spell and ammo for the equipped weapon, keeping the armour as is. */
export const bestWeaponSetup = (st: LoadoutState, ev: Scorer, pool: Pool): Scored | null => {
  const weapon = st.equipment.weapon;
  if (!weapon) return null;
  let best: Scored | null = null;
  const ammos = ammoOptions(weapon, pool);
  for (const style of stylesForFamily(weapon, pool.family)) {
    const spellOpts: (Spell | null)[] = style.stance === 'Autocast' ? candidateSpells(weapon, pool.settings) : [null];
    for (const spell of spellOpts) {
      for (const ammo of ammos) {
        const next: LoadoutState = { equipment: { ...st.equipment, ammo }, style, spell };
        const score = ev.score(next);
        if (!best || score > best.score + EPS) best = { state: next, score };
      }
    }
  }
  return best;
};

/** Coordinate ascent: swap one slot at a time while DPS improves. */
export const ascend = (start: LoadoutState, ev: Scorer, pool: Pool): Scored | null => {
  let cur = bestWeaponSetup(start, ev, pool);
  if (!cur) return null;
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const slot of ARMOUR_SLOTS) {
      if (slot === 'shield' && cur.state.equipment.weapon?.isTwoHanded) continue;
      for (const cand of [null, ...pool.armour[slot]]) {
        if ((cand?.id ?? null) === (cur.state.equipment[slot]?.id ?? null)) continue;
        const next: LoadoutState = { ...cur.state, equipment: { ...cur.state.equipment, [slot]: cand } };
        const score = ev.score(next);
        if (score > cur.score + EPS) {
          cur = { state: next, score };
          improved = true;
        }
      }
    }
    const ws = bestWeaponSetup(cur.state, ev, pool);
    if (ws && ws.score > cur.score + EPS) {
      cur = ws;
      improved = true;
    }
    if (!improved) break;
  }
  return cur;
};

const heuristicScore = (piece: EquipmentPiece, family: Family) => {
  const [a, ...rest] = familyStats(piece, family);
  if (family === 'melee') return Math.max(a, rest[0], rest[1]) * 0.5 + rest[2] * 1.5;
  if (family === 'ranged') return a * 0.5 + rest[0] * 1.5;
  return a + rest[0] * 0.3;
};

/** Caches a value per pool; the search calls optimize on the same pool many times. */
const perPool = <T>(compute: (pool: Pool) => T) => {
  const cache = new WeakMap<Pool, T>();
  return (pool: Pool) => {
    if (!cache.has(pool)) cache.set(pool, compute(pool));
    return cache.get(pool)!;
  };
};

const heuristicArmour = perPool((pool: Pool): PlayerEquipment => {
  const eq = emptyEquipment();
  for (const slot of ARMOUR_SLOTS) {
    let best: EquipmentPiece | null = null;
    let bestScore = 0;
    for (const p of pool.armour[slot]) {
      const s = heuristicScore(p, pool.family);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    eq[slot] = best;
  }
  return eq;
});

const withWeapon = (equipment: PlayerEquipment, weapon: EquipmentPiece): LoadoutState => ({
  equipment: {
    ...equipment, weapon, ammo: null, shield: weapon.isTwoHanded ? null : equipment.shield,
  },
  style: getDefaultCombatStyle(weapon.category),
  spell: null,
});

/** The loadout with as many of `items` worn as the pool allows, e.g. leaving out another style's items. */
export const wearing = (st: LoadoutState, items: EquipmentPiece[], pool: Pool): LoadoutState => {
  const weapon = items.find((i) => i.slot === 'weapon' && pool.weapons.some((w) => w.id === i.id));
  const next = weapon ? withWeapon(st.equipment, pool.weapons.find((w) => w.id === weapon.id)!) : st;
  const equipment = { ...next.equipment };
  for (const i of items) {
    if (i.slot === 'weapon' || i.slot === 'ammo' || !pool.armour[i.slot as ArmourSlot].some((p) => p.id === i.id)) continue;
    if (i.slot === 'shield' && equipment.weapon?.isTwoHanded) continue;
    equipment[i.slot] = i;
  }
  return { ...next, equipment };
};

/** Full sets available in the pool, as the concrete pieces to equip. */
const availableSets = perPool((pool: Pool): EquipmentPiece[][] => {
  const byName = new Map<string, EquipmentPiece>();
  for (const p of [...pool.weapons, ...ARMOUR_SLOTS.flatMap((s) => pool.armour[s])]) byName.set(p.name, p);
  const result: EquipmentPiece[][] = [];
  for (const set of GEAR_SETS) {
    if (!set.families.includes(pool.family)) continue;
    const pieces = set.pieces.map((alts) => alts.map((n) => byName.get(n)).find(Boolean));
    if (pieces.every(Boolean)) result.push(pieces as EquipmentPiece[]);
  }
  return result;
});

/** How many of the best-scoring weapons get a full armour search. */
const TOP_WEAPONS = 3;

export interface OptimizeOptions {
  start?: LoadoutState | null;
}

export const optimize = (pool: Pool, ev: Scorer, opts: OptimizeOptions = {}): Scored | null => {
  const { weapons } = pool;
  if (!weapons.length) return null;
  const baseEquip = opts.start ? { ...opts.start.equipment } : heuristicArmour(pool);
  // Slot-by-slot ascent can't leave a complete set (dropping one piece loses the bonus), so a new weapon is also
  // tried from fresh armour in case it's best without the set the current loadout wears.
  const bases = opts.start ? [baseEquip, heuristicArmour(pool)] : [baseEquip];

  const screened = weapons
    .map((w) => bestWeaponSetup(withWeapon(baseEquip, w), ev, pool))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_WEAPONS);

  let best: Scored | null = null;
  const consider = (s: Scored | null) => {
    if (s && (!best || s.score > best.score + EPS)) best = s;
  };
  for (const s of screened) {
    for (const base of bases) consider(ascend(withWeapon(base, s.state.equipment.weapon!), ev, pool));
  }

  for (const pieces of availableSets(pool)) {
    const setWeapon = pieces.find((p) => p.slot === 'weapon');
    const starts = setWeapon ? [withWeapon(baseEquip, setWeapon)] : screened.map((s) => s.state);
    for (const st of starts) {
      const equipment = { ...st.equipment };
      for (const p of pieces) if (p.slot !== 'weapon') equipment[p.slot] = p;
      consider(ascend({ ...st, equipment }, ev, pool));
    }
  }
  return best;
};

export const toRef = (st: LoadoutState): LoadoutRef => ({
  equipment: Object.fromEntries(SLOTS.filter((s) => st.equipment[s]).map((s) => [s, st.equipment[s]!.id])),
  styleName: st.style.name,
  styleStance: st.style.stance,
  spell: st.spell?.name ?? null,
});

export const fromRef = (ref: LoadoutRef, pool: Pool): LoadoutState => {
  const equipment = emptyEquipment();
  for (const [slot, id] of Object.entries(ref.equipment) as [Slot, number][]) {
    const piece = itemById(id) ?? null;
    equipment[slot] = piece && slot === 'weapon' ? withDart(piece, pool.dart) : piece;
  }
  const styles = getCombatStylesForCategory(equipment.weapon?.category ?? EquipmentCategory.NONE);
  const style = styles.find((s) => s.name === ref.styleName && s.stance === ref.styleStance) ?? styles[0];
  return { equipment, style, spell: ref.spell ? spellByName(ref.spell) : null };
};

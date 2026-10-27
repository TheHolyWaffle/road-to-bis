import type { PlayerEquipment, PlayerSkills, Spellbook } from './dps-calc';
import type { Potion } from './dps-calc';

export type Family = 'melee' | 'ranged' | 'magic';
export const FAMILIES: Family[] = ['melee', 'ranged', 'magic'];
export const FAMILY_LABEL: Record<Family, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

export type Slot = keyof PlayerEquipment;
export const SLOTS: Slot[] = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];

/** Ammo is a consumable, so it's never bought, sold or counted towards a loadout's cost. */
export const GEAR_SLOTS = SLOTS.filter((s) => s !== 'ammo');

export interface CombatSettings {
  skills: PlayerSkills;
  unlocked: {
    piety: boolean;
    rigour: boolean;
    augury: boolean;
    deadeye: boolean;
    mysticVigour: boolean;
  };
  potions: Record<Family, Potion[]>;
  spellbooks: Spellbook[];
  /** Treat all tradeable ammo and darts as available, since they are consumables rather than upgrades. */
  anyAmmo: boolean;
  /**
   * Report setups whose damage depends on the monster's HP (ruby bolts, Vardorvis) at their exact average over a whole
   * kill, instead of their DPS at half HP. Slower.
   */
  exactKillTime: boolean;
}

export interface MonsterSpec {
  /** `${id}|${name}|${version}`, see monsterKey(). */
  key: string;
  weight: number;
  families: Family[];
  onTask: boolean;
  /** Raid scaling: party size for CoX and ToB, raid level for ToA. */
  scaling?: MonsterScaling;
  /**
   * The fight this is a phase of, e.g. "Zulrah" for its three forms. Phases of one fight are scored together, by the
   * time a whole kill takes, and share the fight's weight.
   */
  encounter?: string;
  /** HP you take off it per kill of the fight, when that isn't its full HP (each Hydra phase is a quarter of it). */
  hp?: number;
}

export interface MonsterScaling {
  partySize?: number;
  toaInvocationLevel?: number;
}

/** A serialisable loadout: equipment as item ids, style by index into the weapon's style list. */
export interface LoadoutRef {
  equipment: Partial<Record<Slot, number>>;
  styleName: string;
  styleStance: string | null;
  spell: string | null;
}

export interface OptimizedLoadout {
  loadout: LoadoutRef | null;
  dps: number;
}

/** A loadout on a monster's cost curve: the best one found for some trade-off between score and gp spent. */
export interface FrontierPoint extends OptimizedLoadout {
  loadout: LoadoutRef;
  /** gp for the items in it that you don't own. */
  cost: number;
}

/** How far gp can take one style at one monster. */
export interface Frontier {
  /** The best loadout from gear you own. */
  baseline: OptimizedLoadout;
  /** Cheapest first, each scoring more than the last; the last one is best in slot. */
  points: FrontierPoint[];
  /** The best loadouts with the items on other monsters' curves, which may be off this one. */
  alternatives?: FrontierPoint[];
}

/**
 * How a cost was derived: GE price, made from tradeable parts, imbuing an owned item, made only from items you own, or
 * untradeable (counted as 1 gp).
 */
export type PriceVia = 'ge' | 'recipe' | 'imbue' | 'owned-parts' | 'untradeable';

export interface UpgradePart {
  name: string;
  quantity: number;
  /** Bought on the GE, already in your bank, or untradeable and earned rather than bought. */
  source: 'buy' | 'owned' | 'earned';
}

export interface Upgrade {
  key: string;
  label: string;
  itemIds: number[];
  cost: number;
  priceVia: PriceVia;
  /** For crafted items: what it's made from. */
  parts?: UpgradePart[];
  /** Families in which any of the upgrade's items could matter. */
  families: Family[];
}

/** A loadout's equipment ids, leaving out ammo. */
export const gearIds = (loadout: LoadoutRef) => GEAR_SLOTS.map((s) => loadout.equipment[s]).filter((id): id is number => id !== undefined);

/** Monsters grouped into fights in order of first appearance: each encounter's phases together, other monsters alone. */
export const fightsOf = (monsters: MonsterSpec[]) => {
  const fights: { name: string; encounter?: string; phases: number[] }[] = [];
  monsters.forEach((m, i) => {
    const fight = m.encounter ? fights.find((f) => f.encounter === m.encounter) : undefined;
    if (fight) fight.phases.push(i);
    else fights.push({ name: m.encounter ?? m.key, encounter: m.encounter, phases: [i] });
  });
  return fights;
};

import {
  calculateEquipmentBonusesFromGear, getMonsters, INITIAL_MONSTER_INPUTS, monstersData, PotionMap, Prayer, scaleMonster,
} from './dps-calc';
import type {
  Monster, Player, PlayerCombatStyle, PlayerEquipment, PlayerSkills, Spell,
} from './dps-calc';
import { generateEmptyPlayer, zeroSkills } from './empty-player';
import type { CombatSettings, Family, MonsterScaling } from './types';

export interface LoadoutState {
  equipment: PlayerEquipment;
  style: PlayerCombatStyle;
  spell: Spell | null;
}

export const allMonsters = getMonsters();

export const monsterKey = (m: { id: number, name: string, version?: string }) => `${m.id}|${m.name}|${m.version ?? ''}`;

export const monsterByKey = new Map(allMonsters.map((m) => [monsterKey(m), m]));

export const monsterLabel = (key: string) => {
  const m = monsterByKey.get(key);
  if (!m) return key;
  return m.version ? `${m.name} (${m.version})` : m.name;
};

// getMonsters() drops the combat level, so it's read from the raw data.
const levelByKey = new Map(monstersData.map((m) => [monsterKey(m), m.level]));
export const monsterLevel = (key: string): number | undefined => levelByKey.get(key);

/**
 * Effects that depend on the monster's current HP (ruby bolt procs, Vardorvis's scaling) are evaluated at mid-fight
 * rather than at full HP, as the wiki calculator does by default. At full HP every ruby proc hits the 100 cap, which
 * overrates ruby bolts by about 6% at Vorkath compared with a whole kill; at half HP it's within 2%.
 */
const MID_FIGHT_HP = 0.5;

export const buildMonster = (key: string, scaling: MonsterScaling = {}): Monster => {
  const base = monsterByKey.get(key);
  if (!base) throw new Error(`Unknown monster ${key}`);
  return { ...base, inputs: { ...INITIAL_MONSTER_INPUTS, ...scaling, monsterCurrentHp: Math.round(base.skills.hp * MID_FIGHT_HP) } };
};

/** The monster's HP after raid scaling (party size, raid level). */
export const scaledHp = (monster: Monster) => scaleMonster(monster).skills.hp;

const hpCache = new Map<string, number>();
/** A monster's full HP once raid scaling is applied. */
export const fullHp = (key: string, scaling: MonsterScaling = {}) => {
  const k = `${key}|${JSON.stringify(scaling)}`;
  if (!hpCache.has(k)) hpCache.set(k, monsterByKey.has(key) ? scaledHp(buildMonster(key, scaling)) : 0);
  return hpCache.get(k)!;
};

export const prayersFor = (family: Family, { unlocked }: CombatSettings): Prayer[] => {
  if (family === 'melee') return unlocked.piety ? [Prayer.PIETY] : [Prayer.ULTIMATE_STRENGTH, Prayer.INCREDIBLE_REFLEXES];
  if (family === 'ranged') {
    if (unlocked.rigour) return [Prayer.RIGOUR];
    return [unlocked.deadeye ? Prayer.DEADEYE : Prayer.EAGLE_EYE];
  }
  if (unlocked.augury) return [Prayer.AUGURY];
  return [unlocked.mysticVigour ? Prayer.MYSTIC_VIGOUR : Prayer.MYSTIC_MIGHT];
};

export const boostsFor = (family: Family, settings: CombatSettings): PlayerSkills => {
  const boosts = zeroSkills();
  for (const p of settings.potions[family]) {
    const result = PotionMap[p].calculateFn(settings.skills);
    for (const [k, v] of Object.entries(result) as [keyof PlayerSkills, number][]) {
      boosts[k] = Math.max(boosts[k], v);
    }
  }
  return boosts;
};

export interface PlayerContext {
  family: Family;
  settings: CombatSettings;
  onTask: boolean;
  monster: Monster;
  prayers: Prayer[];
  boosts: PlayerSkills;
}

export const playerContext = (family: Family, settings: CombatSettings, onTask: boolean, monster: Monster): PlayerContext => ({
  family, settings, onTask, monster, prayers: prayersFor(family, settings), boosts: boostsFor(family, settings),
});

export const buildPlayer = (state: LoadoutState, ctx: PlayerContext): Player => {
  const player = generateEmptyPlayer();
  player.skills = { ...ctx.settings.skills };
  player.boosts = { ...ctx.boosts };
  player.prayers = [...ctx.prayers];
  player.equipment = { ...state.equipment };
  player.style = state.style;
  player.spell = state.spell;
  player.buffs.potions = [...ctx.settings.potions[ctx.family]];
  player.buffs.onSlayerTask = ctx.onTask;
  const totals = calculateEquipmentBonusesFromGear(player, ctx.monster);
  player.bonuses = totals.bonuses;
  player.offensive = totals.offensive;
  player.defensive = totals.defensive;
  player.attackSpeed = totals.attackSpeed;
  return player;
};

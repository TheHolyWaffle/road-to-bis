import { monsterKey } from './build-player';
import {
  monstersData, NPCVsPlayerCalc,
} from './dps-calc';
import type { CombatStyleType, Monster, Player } from './dps-calc';
import type { CombatSettings } from './types';

const COMBAT_STYLES: Record<string, CombatStyleType> = {
  stab: 'stab', slash: 'slash', crush: 'crush', ranged: 'ranged', magic: 'magic',
};

/** The combat styles each monster attacks with, from the wiki data. Non-combat entries like dragonfire are left out. */
const incomingByKey = new Map(monstersData.map((m) => [
  monsterKey(m),
  [...new Set((m.style ?? []).map((s: string) => COMBAT_STYLES[s.toLowerCase()]).filter(Boolean))],
]));

export const incomingStyles = (monster: Monster) => incomingByKey.get(monsterKey(monster)) ?? [];

/**
 * Damage per second the monster deals to this loadout. Assumes it uses each of its listed styles equally often and
 * that you pray against whichever would hurt most; a single-style monster always hits you. Special attacks and
 * mechanics aren't modelled.
 */
export const damageTakenPerSecond = (player: Player, monster: Monster): number => {
  const perStyle = incomingStyles(monster).map((style) => {
    try {
      return new NPCVsPlayerCalc(player, { ...monster, style }).getDps();
    } catch {
      return 0;
    }
  });
  if (perStyle.length > 1) perStyle.splice(perStyle.indexOf(Math.max(...perStyle)), 1);
  return perStyle.length ? perStyle.reduce((a, b) => a + b, 0) / perStyle.length : 0;
};

export interface TripStats {
  killsPerHour: number;
  /** Infinity when the monster can't hurt you. */
  killsPerTrip: number;
  damagePerKill: number;
}

/** Kills per hour, counting the trips that running out of food forces. `hp` is the monster's, after raid scaling. */
export const tripStats = (dps: number, damageTaken: number, hp: number, settings: CombatSettings): TripStats => {
  if (dps <= 0) return { killsPerHour: 0, killsPerTrip: 0, damagePerKill: Infinity };
  const killSeconds = hp / dps;
  const damagePerKill = damageTaken * killSeconds;
  const killsPerTrip = damagePerKill > 0 ? (settings.skills.hp + settings.foodPerTrip) / damagePerKill : Infinity;
  const bankingPerKill = Number.isFinite(killsPerTrip) ? settings.bankingSeconds / killsPerTrip : 0;
  return { killsPerHour: 3600 / (killSeconds + bankingPerKill), killsPerTrip, damagePerKill };
};

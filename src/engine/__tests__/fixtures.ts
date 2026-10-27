import { readFileSync } from 'node:fs';
import { Potion } from '../dps-calc';
import { parseBank } from '../../lib/bank';
import type { CombatSettings } from '../types';

export const sampleBank = () => parseBank(readFileSync(new URL('../../../sample-bank.tsv', import.meta.url), 'utf8'));

export const sampleOwnedIds = () => sampleBank().ownedIds;

export const maxedSettings: CombatSettings = {
  skills: {
    atk: 99, def: 99, hp: 99, magic: 99, prayer: 99, ranged: 99, str: 99, mining: 99, herblore: 99, farming: 99,
  },
  unlocked: {
    piety: true, rigour: true, augury: true, deadeye: true, mysticVigour: true,
  },
  potions: { melee: [Potion.SUPER_COMBAT], ranged: [Potion.RANGING], magic: [Potion.SATURATED_HEART] },
  spellbooks: ['standard', 'ancient', 'arceuus'],
  anyAmmo: true,
  exactKillTime: false,
};

/** Levels that go with the sample bank. Which prayers are unlocked is assumed. */
export const sampleSettings: CombatSettings = {
  ...maxedSettings,
  skills: {
    atk: 94, def: 93, hp: 99, magic: 97, prayer: 90, ranged: 99, str: 95, mining: 90, herblore: 99, farming: 99,
  },
  unlocked: {
    piety: true, rigour: true, augury: true, deadeye: false, mysticVigour: false,
  },
  potions: { melee: [Potion.SUPER_COMBAT], ranged: [Potion.RANGING], magic: [Potion.SATURATED_HEART] },
};

import {
  DEFAULT_ATTACK_SPEED, EquipmentCategory, getDefaultCombatStyle,
} from './dps-calc';
import type { Player, PlayerEquipment, PlayerSkills } from './dps-calc';

// Mirrors generateEmptyPlayer() from the engine's state.tsx, which can't be imported without mobx/react.
const skillsAt = (level: number): PlayerSkills => ({
  atk: level, def: level, hp: level, magic: level, prayer: level, ranged: level, str: level, mining: level, herblore: level, farming: level,
});
export const zeroSkills = () => skillsAt(0);
export const maxedSkills = () => skillsAt(99);

export const emptyEquipment = (): PlayerEquipment => ({
  head: null, cape: null, neck: null, ammo: null, weapon: null, body: null,
  shield: null, legs: null, hands: null, feet: null, ring: null,
});

export const generateEmptyPlayer = (): Player => ({
  name: 'Loadout',
  style: getDefaultCombatStyle(EquipmentCategory.NONE),
  skills: maxedSkills(),
  boosts: zeroSkills(),
  equipment: emptyEquipment(),
  attackSpeed: DEFAULT_ATTACK_SPEED,
  prayers: [],
  bonuses: { str: 0, ranged_str: 0, magic_str: 0, prayer: 0 },
  defensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
  offensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
  buffs: {
    potions: [],
    onSlayerTask: false,
    inWilderness: false,
    kandarinDiary: true,
    chargeSpell: false,
    markOfDarknessSpell: false,
    forinthrySurge: false,
    soulreaperStacks: 5,
    baAttackerLevel: 0,
    chinchompaDistance: 4,
    usingSunfireRunes: false,
    fragmentOfWind: false,
    fragmentOfWater: false,
    fragmentOfEarth: false,
    fragmentOfFire: false,
  },
  spell: null,
});

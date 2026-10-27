// Single entry point to the vendored osrs-dps-calc engine, whose upstream file names aren't kebab-case.
export { default as PlayerVsNPCCalc } from '@/lib/PlayerVsNPCCalc';
export { default as NPCVsPlayerCalc } from '@/lib/NPCVsPlayerCalc';
export {
  ammoApplicability, AmmoApplicability, availableEquipment, equipmentAliases, calculateEquipmentBonusesFromGear,
  CORRUPTED_GAUNTLET_EQUIPMENT_IDS, GAUNTLET_EQUIPMENT_IDS,
} from '@/lib/Equipment';
export { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
export { scaleMonster } from '@/lib/MonsterScaling';
export { default as monstersData } from '@/../cdn/json/monsters.json';
export { BLOWPIPE_IDS, DEFAULT_ATTACK_SPEED, SECONDS_PER_TICK } from '@/lib/constants';
export {
  calculateCombatLevel, getCombatStylesForCategory, getDefaultCombatStyle, isDefined, PotionMap,
} from '@/utils';
export { EquipmentCategory } from '@/enums/EquipmentCategory';
export { Prayer } from '@/enums/Prayer';
export { default as Potion } from '@/enums/Potion';
export { spellByName, spells } from '@/types/Spell';
export type {
  EquipmentPiece, Player, PlayerEquipment, PlayerSkills,
} from '@/types/Player';
export type { Monster } from '@/types/Monster';
export type { Spell, Spellbook } from '@/types/Spell';
export type { CombatStyleType, PlayerCombatStyle } from '@/types/PlayerCombatStyle';
export { default as playerVsNpcSource } from '@/lib/PlayerVsNPCCalc.ts?raw';
export { default as baseCalcSource } from '@/lib/BaseCalc.ts?raw';
export { default as equipmentSource } from '@/lib/Equipment.ts?raw';

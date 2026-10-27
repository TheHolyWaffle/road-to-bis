import { spells } from './dps-calc';
import type { EquipmentPiece, Spell } from './dps-calc';
import type { CombatSettings } from './types';

const SPELL_LEVELS: Record<string, number> = {
  'Wind Strike': 1, 'Water Strike': 5, 'Earth Strike': 9, 'Fire Strike': 13,
  'Wind Bolt': 17, 'Water Bolt': 23, 'Earth Bolt': 29, 'Fire Bolt': 35,
  'Crumble Undead': 39, 'Wind Blast': 41, 'Water Blast': 47, 'Iban Blast': 50, 'Magic Dart': 50,
  'Earth Blast': 53, 'Fire Blast': 59, 'Saradomin Strike': 60, 'Claws of Guthix': 60, 'Flames of Zamorak': 60,
  'Wind Wave': 62, 'Water Wave': 65, 'Earth Wave': 70, 'Fire Wave': 75,
  'Wind Surge': 81, 'Water Surge': 85, 'Earth Surge': 90, 'Fire Surge': 95,
  'Smoke Rush': 50, 'Shadow Rush': 52, 'Blood Rush': 56, 'Ice Rush': 58,
  'Smoke Burst': 62, 'Shadow Burst': 64, 'Blood Burst': 68, 'Ice Burst': 70,
  'Smoke Blitz': 74, 'Shadow Blitz': 76, 'Blood Blitz': 80, 'Ice Blitz': 82,
  'Smoke Barrage': 86, 'Shadow Barrage': 88, 'Blood Barrage': 92, 'Ice Barrage': 94,
  'Ghostly Grasp': 35, 'Skeletal Grasp': 56, 'Undead Grasp': 79,
  'Inferior Demonbane': 44, 'Superior Demonbane': 62, 'Dark Demonbane': 82,
};

const STAFF_SPELLS: Record<string, RegExp> = {
  'Iban Blast': /^Iban's staff/,
  'Magic Dart': /^(Slayer's staff|Staff of the dead|Toxic staff of the dead|Staff of light|Staff of balance)/,
  'Saradomin Strike': /^(Saradomin staff|Staff of light)/,
  'Claws of Guthix': /^(Guthix staff|Void knight mace|Staff of balance)/,
  'Flames of Zamorak': /^(Zamorak staff|Staff of the dead|Toxic staff of the dead|Thammaron's sceptre)/,
};

/** Groups whose members only differ in tier; only the strongest castable member is worth evaluating. */
const spellGroup = (s: Spell) => {
  if (STAFF_SPELLS[s.name] || s.name === 'Crumble Undead') return s.name;
  if (s.name.includes('Demonbane')) return 'demonbane';
  if (s.name.includes('Grasp')) return 'grasp';
  return `${s.spellbook}:${s.name.split(' ')[0]}`;
};

export const candidateSpells = (weapon: EquipmentPiece, settings: CombatSettings): Spell[] => {
  const best = new Map<string, Spell>();
  for (const s of spells) {
    const level = SPELL_LEVELS[s.name];
    if (level === undefined || s.max_hit <= 0) continue;
    if (level > settings.skills.magic || !settings.spellbooks.includes(s.spellbook)) continue;
    const staff = STAFF_SPELLS[s.name];
    if (staff && !staff.test(weapon.name)) continue;
    const group = spellGroup(s);
    const prev = best.get(group);
    if (!prev || s.max_hit > prev.max_hit) best.set(group, s);
  }
  return [...best.values()];
};

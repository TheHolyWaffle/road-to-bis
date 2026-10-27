import type { Family } from './types';

export interface GearSet {
  name: string;
  families: Family[];
  /** One entry per piece; each lists acceptable alternatives, best first. */
  pieces: string[][];
}

const voidSet = (helm: string, family: Family): GearSet => ({
  name: `Elite void (${family})`,
  families: [family],
  pieces: [[helm], ['Elite void top', 'Void knight top'], ['Elite void robe', 'Void knight robe'], ['Void knight gloves']],
});

const moonSet = (moon: string, weapon: string, family: Family): GearSet => ({
  name: `${moon} Moon armour`,
  families: [family],
  pieces: [[`${moon} Moon helm`], [`${moon} Moon chestplate`], [`${moon} Moon tassets`], [weapon]],
});

const armourSet = (name: string, family: Family, pieces: string[]): GearSet => ({
  name, families: [family], pieces: pieces.map((p) => [p]),
});

/**
 * Sets that only pay off with every piece worn, which per-slot search can't discover on its own: ones with a set
 * bonus, and plain armour sets that only beat a set bonus (e.g. Masori over elite void) once you own them all. The
 * optimizer tries each as a starting point.
 */
export const GEAR_SETS: GearSet[] = [
  voidSet('Void melee helm', 'melee'),
  voidSet('Void ranger helm', 'ranged'),
  voidSet('Void mage helm', 'magic'),
  { name: "Inquisitor's armour", families: ['melee'], pieces: [["Inquisitor's great helm"], ["Inquisitor's hauberk"], ["Inquisitor's plateskirt"]] },
  { name: 'Obsidian armour', families: ['melee'], pieces: [['Obsidian helmet'], ['Obsidian platebody'], ['Obsidian platelegs']] },
  { name: 'Crystal armour', families: ['ranged'], pieces: [['Crystal helm'], ['Crystal body'], ['Crystal legs']] },
  { name: "Dharok's equipment", families: ['melee'], pieces: [["Dharok's helm"], ["Dharok's platebody"], ["Dharok's platelegs"], ["Dharok's greataxe"]] },
  moonSet('Blood', 'Dual macuahuitl', 'melee'),
  moonSet('Eclipse', 'Eclipse atlatl', 'ranged'),
  moonSet('Blue', 'Blue Moon spear', 'magic'),
  armourSet('Masori armour (f)', 'ranged', ['Masori mask (f)', 'Masori body (f)', 'Masori chaps (f)']),
  armourSet('Masori armour', 'ranged', ['Masori mask', 'Masori body', 'Masori chaps']),
  armourSet('Armadyl armour', 'ranged', ['Armadyl helmet', 'Armadyl chestplate', 'Armadyl chainskirt']),
  armourSet('Torva armour', 'melee', ['Torva full helm', 'Torva platebody', 'Torva platelegs']),
  armourSet('Oathplate armour', 'melee', ['Oathplate helm', 'Oathplate chest', 'Oathplate legs']),
  armourSet('Bandos armour', 'melee', ['Bandos chestplate', 'Bandos tassets']),
  armourSet('Ancestral robes', 'magic', ['Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom']),
  armourSet('Virtus robes', 'magic', ['Virtus mask', 'Virtus robe top', 'Virtus robe bottom']),
];

export const SET_PIECE_NAMES = new Set(GEAR_SETS.flatMap((s) => s.pieces.flat()));

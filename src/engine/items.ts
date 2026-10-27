import {
  AmmoApplicability, ammoApplicability, availableEquipment, baseCalcSource, CORRUPTED_GAUNTLET_EQUIPMENT_IDS,
  equipmentAliases, equipmentSource, GAUNTLET_EQUIPMENT_IDS, getCombatStylesForCategory, playerVsNpcSource,
} from './dps-calc';
import type { EquipmentPiece, PlayerCombatStyle } from './dps-calc';
import restrictedItems from '../data/restricted-items.json';
import { SET_PIECE_NAMES } from './sets';
import type { Family } from './types';

const byId = new Map<number, EquipmentPiece>(availableEquipment.map((e) => [e.id, e]));
export const itemById = (id: number) => byId.get(id);

const aliasToCanonical = new Map<number, number>();
const canonicalToAliases = new Map<number, number[]>();
for (const [canonical, aliases] of Object.entries(equipmentAliases)) {
  canonicalToAliases.set(Number(canonical), [...aliases]);
  for (const a of aliases) aliasToCanonical.set(a, Number(canonical));
}
export const canonicalId = (id: number) => aliasToCanonical.get(id) ?? id;
export const aliasIds = (id: number) => canonicalToAliases.get(id) ?? [];

// The engine resolves aliases on every calc by scanning this whole table, which dominates calc time. Every piece
// handed to the engine is canonical already (see representative()), so the table is emptied once it's been read.
for (const k of Object.keys(equipmentAliases)) delete equipmentAliases[Number(k)];

/** Items that only exist in seasonal game modes or only work inside a minigame, or have no real attack speed. */
const UNUSABLE_IDS = new Set([...GAUNTLET_EQUIPMENT_IDS, ...CORRUPTED_GAUNTLET_EQUIPMENT_IDS]);
const SEASONAL_NAMES = new Set(restrictedItems.seasonal);

/** PvP-minigame rewards; only the untradeable ones are useless outside the minigame. See candidates.ts. */
export const MINIGAME_ITEM_NAMES = new Set(restrictedItems.minigame);
// Includes the exclusions of the wiki calculator's own item picker.
const UNUSABLE_NAMES = /^((barbed|blunt|bullet|field) arrow|castle wars (arrow|bolts)|seeking .* arrow|.* greegree|corrupted .*|fine mesh net|wilderness champion amulet|crystal .* \(i\)|.*\((last man standing|bh|deadman|deadman mode|historical|beta|nz|wilderness wars)\))$/i;
const isUsable = (e: EquipmentPiece) => !UNUSABLE_IDS.has(e.id) && !SEASONAL_NAMES.has(e.name) && !UNUSABLE_NAMES.test(e.name)
  && (e.slot !== 'weapon' || e.speed > 0);

const BAD_VERSION = /broken|inactive|uncharged|empty|locked|^0$|deadman|damaged|beta/i;
const versionScore = (e: EquipmentPiece) => {
  const statSum = Object.values(e.offensive).reduce((a, b) => a + Math.max(0, b), 0)
    + Object.values(e.bonuses).reduce((a, b) => a + Math.max(0, b), 0);
  return (BAD_VERSION.test(e.version) ? -1e6 : 0) + statSum;
};

const byLowerName = new Map<string, EquipmentPiece[]>();
for (const e of availableEquipment) {
  const k = e.name.toLowerCase();
  if (!byLowerName.has(k)) byLowerName.set(k, []);
  byLowerName.get(k)!.push(e);
}

/** One canonical piece per item name: the best functional (e.g. charged) version. */
const preferredByName = new Map<string, EquipmentPiece>();
for (const [name, versions] of byLowerName) {
  const usable = versions.filter(isUsable);
  if (!usable.length) continue;
  const best = usable.reduce((b, e) => (versionScore(e) > versionScore(b) ? e : b));
  preferredByName.set(name, byId.get(canonicalId(best.id)) ?? best);
}

export const representativeId = (id: number): number | null => {
  const piece = byId.get(canonicalId(id)) ?? byId.get(id);
  return piece ? preferredByName.get(piece.name.toLowerCase())?.id ?? null : null;
};

/** Every distinct usable item, one canonical entry per name. */
export const representatives = [...new Map([...preferredByName.values()].map((e) => [e.id, e])).values()];

export const versionsOf = (piece: EquipmentPiece) => byLowerName.get(piece.name.toLowerCase()) ?? [piece];

const BANK_NAME_SUFFIXES = [
  / \((uncharged|empty|inactive|deadman|broken|damaged|u|g|t|l)\)$/i,
  / \d{1,3}$/, // degraded barrows, e.g. "Guthan's helm 100"
];

/** Maps a bank row to the representative equipment id, or null when it isn't equipment. */
export const resolveBankItem = (id: number, name: string): number | null => {
  const direct = representativeId(id);
  if (direct !== null) return direct;

  let lower = name.toLowerCase().trim();
  for (let i = 0; i < 3; i++) {
    const hit = preferredByName.get(lower);
    if (hit) return hit.id;
    const stripped = BANK_NAME_SUFFIXES.reduce((n, re) => n.replace(re, ''), lower);
    if (stripped === lower) break;
    lower = stripped;
  }
  return null;
};

const CAST_ONLY = 'Manual Cast';

export const stylesForFamily = (weapon: EquipmentPiece | null, family: Family): PlayerCombatStyle[] => {
  const styles = getCombatStylesForCategory(weapon?.category ?? ('' as EquipmentPiece['category']));
  return styles.filter((s) => {
    if (s.stance === CAST_ONLY || s.stance === 'Defensive Autocast' || s.type === null) return false;
    if (family === 'melee') return s.type === 'stab' || s.type === 'slash' || s.type === 'crush';
    return s.type === family;
  });
};

export const weaponFamilies = (weapon: EquipmentPiece): Family[] => (['melee', 'ranged', 'magic'] as Family[])
  .filter((f) => stylesForFamily(weapon, f).length > 0);

export const weaponNeedsAmmo = (weapon: EquipmentPiece | null) => !!weapon
  && ammoApplicability(weapon.id, -1) === AmmoApplicability.INVALID;

export const ammoFitsWeapon = (weapon: EquipmentPiece, ammo: EquipmentPiece) => (
  ammoApplicability(weapon.id, ammo.id) === AmmoApplicability.INCLUDED
);

/** Equipment names the engine checks for explicitly, i.e. items with effects beyond their stats. */
export const SPECIAL_ITEM_NAMES: Set<string> = (() => {
  const names = new Set(availableEquipment.map((e) => e.name));
  const found = new Set<string>();
  for (const src of [playerVsNpcSource, baseCalcSource, equipmentSource]) {
    for (const m of src.matchAll(/'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)"/g)) {
      const s = (m[1] ?? m[2]).replace(/\\'/g, "'");
      if (names.has(s)) found.add(s);
    }
  }
  return found;
})();

export const isSpecial = (piece: EquipmentPiece) => SPECIAL_ITEM_NAMES.has(piece.name)
  || SET_PIECE_NAMES.has(piece.name)
  || /slayer helmet|black mask|salve amulet|void/i.test(piece.name);

export const familyStats = (piece: EquipmentPiece, family: Family): number[] => {
  const { offensive: o, bonuses: b } = piece;
  if (family === 'melee') return [o.stab, o.slash, o.crush, b.str];
  if (family === 'ranged') return [o.ranged, b.ranged_str];
  return [o.magic, b.magic_str];
};

export const isRelevant = (piece: EquipmentPiece, family: Family) => {
  if (piece.slot === 'weapon') return weaponFamilies(piece).includes(family);
  return isSpecial(piece) || familyStats(piece, family).some((v) => v > 0);
};

export const allStats = (piece: EquipmentPiece) => [
  ...Object.values(piece.offensive), piece.bonuses.str, piece.bonuses.ranged_str, piece.bonuses.magic_str,
];

/** True when `a` is at least as good as `b` on every given stat and strictly better on one. */
export const dominates = (a: number[], b: number[]) => {
  let strictly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return false;
    if (a[i] > b[i]) strictly = true;
  }
  return strictly;
};

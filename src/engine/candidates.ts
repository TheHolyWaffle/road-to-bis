import { type EquipmentPiece, isDefined } from './dps-calc';
import {
  allStats, familyStats, isRelevant, isSpecial, itemById, MINIGAME_ITEM_NAMES, representatives,
} from './items';
import {
  type OwnedQuantities, priceFor, type PriceIndex, type PriceQuote, UNTRADEABLE_COST,
} from './prices';
import type { Family, Upgrade } from './types';

export interface CandidateOptions {
  families: Family[];
  excluded: Set<number>;
  /** Also suggest items that need an untradeable you'd have to earn, such as the Infernal cape. */
  includeEarned: boolean;
  /** Everything in the bank, including non-equipment such as crafting materials. */
  ownedQuantities: OwnedQuantities;
}

const geq = (a: number[], b: number[]) => a.every((v, i) => v >= b[i]);

const dominatedByOwned = (piece: EquipmentPiece, owned: EquipmentPiece[], families: Family[]) => {
  if (isSpecial(piece)) return false;
  if (piece.slot !== 'weapon') {
    return owned.some((o) => o.slot === piece.slot && geq(allStats(o), allStats(piece)));
  }
  return families.every((f) => owned.some((o) => o.slot === 'weapon'
    && isRelevant(o, f)
    && o.speed <= piece.speed
    && (!o.isTwoHanded || piece.isTwoHanded)
    && geq(familyStats(o, f), familyStats(piece, f))));
};

const needsEarning = (q: PriceQuote) => q.via === 'untradeable' || (q.via === 'recipe' && !!q.parts?.some((p) => p.source === 'earned'));

/**
 * GE prices, before tax, of the items you own and the upgrades you could buy: what each sells for, and what an owned
 * item costs to buy back once sold. Untradeables and crafted items can't be sold.
 */
export const resaleValues = (ownedIds: number[], prices: PriceIndex, upgrades: Upgrade[]): Map<number, number> => new Map([
  ...ownedIds.flatMap((id) => {
    const piece = itemById(id);
    const q = piece && priceFor(piece, prices);
    return q?.via === 'ge' ? [[id, q.cost] as const] : [];
  }),
  ...upgrades.filter((u) => u.priceVia === 'ge').map((u) => [u.itemIds[0], u.cost] as const),
]);

/** For each upgrade made from items you own, those items, which making it uses up (an imbue, a faceguard's helm). */
export const consumedParts = (upgrades: Upgrade[], ownedIds: number[]): Map<number, number[]> => {
  const idByName = new Map(ownedIds.map((id) => [itemById(id)?.name.toLowerCase(), id]));
  return new Map(upgrades.flatMap((u) => {
    const ids = (u.parts ?? []).filter((p) => p.source === 'owned').map((p) => idByName.get(p.name.toLowerCase())).filter(isDefined);
    return ids.length ? [[u.itemIds[0], ids] as const] : [];
  }));
};

export const buildCandidates = (ownedIds: number[], prices: PriceIndex, opts: CandidateOptions): Upgrade[] => {
  const ownedSet = new Set(ownedIds);
  const owned = ownedIds.map(itemById).filter(isDefined);
  const upgrades: Upgrade[] = [];
  const ownedQuantities = new Map(opts.ownedQuantities);
  for (const p of owned) ownedQuantities.set(p.name.toLowerCase(), Math.max(1, ownedQuantities.get(p.name.toLowerCase()) ?? 0));

  for (const piece of representatives) {
    // Ammo is a consumable, governed by the "any ammo" setting rather than treated as an upgrade.
    if (piece.slot === 'ammo' || ownedSet.has(piece.id) || opts.excluded.has(piece.id)) continue;
    const families = opts.families.filter((f) => isRelevant(piece, f));
    if (!families.length || dominatedByOwned(piece, owned, families)) continue;
    const q: PriceQuote = priceFor(piece, prices, ownedQuantities) ?? { cost: UNTRADEABLE_COST, via: 'untradeable' };
    if (q.via === 'untradeable' && MINIGAME_ITEM_NAMES.has(piece.name)) continue;
    if (!opts.includeEarned && needsEarning(q)) continue;
    upgrades.push({
      key: `item:${piece.id}`, label: piece.name, itemIds: [piece.id], cost: q.cost, priceVia: q.via, parts: q.parts, families,
    });
  }

  // Variants with identical stats and no special effect (e.g. cosmetic recolours) are the same upgrade; keep the cheapest.
  const cheapestByStats = new Map<string, Upgrade>();
  for (const u of upgrades) {
    const piece = itemById(u.itemIds[0])!;
    const key = isSpecial(piece) ? u.key : `${piece.slot}|${piece.speed}|${piece.isTwoHanded}|${piece.category}|${allStats(piece).join(',')}`;
    const prev = cheapestByStats.get(key);
    if (!prev || u.cost < prev.cost) cheapestByStats.set(key, u);
  }
  return [...cheapestByStats.values()];
};

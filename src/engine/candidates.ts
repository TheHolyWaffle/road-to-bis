import { type EquipmentPiece, isDefined } from './dps-calc';
import {
  allStats, familyStats, isRelevant, isSpecial, itemById, MINIGAME_ITEM_NAMES, representatives,
} from './items';
import {
  type OwnedQuantities, partCost, priceFor, type PriceIndex, type PriceQuote, UNTRADEABLE_COST,
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

const geQuote = (id: number, prices: PriceIndex) => {
  const piece = itemById(id);
  const q = piece && priceFor(piece, prices);
  return q?.via === 'ge' ? q : undefined;
};

/**
 * GE sell prices, before tax, of the items you own and the upgrades you could buy: what each sells for once the path
 * replaces it. Untradeables and crafted items can't be sold.
 */
export const resaleValues = (ownedIds: number[], prices: PriceIndex, upgrades: Upgrade[]): Map<number, number> => new Map([
  ...ownedIds,
  ...upgrades.filter((u) => u.priceVia === 'ge').map((u) => u.itemIds[0]),
].flatMap((id) => {
  const sell = geQuote(id, prices)?.sell;
  return sell ? [[id, sell] as const] : [];
}));

/** What buying back each tradeable item you own takes, should the path sell it and need it again. */
export const buyBackCosts = (ownedIds: number[], prices: PriceIndex): [id: number, cost: number][] => ownedIds.flatMap((id) => {
  const q = geQuote(id, prices);
  return q ? [[id, q.cost] as [number, number]] : [];
});

/** An owned item or material that making an upgrade uses up, like an imbue's ring or a faceguard's helm. */
export interface PartUse {
  /** Lowercase, as in the bank's quantities. */
  name: string;
  quantity: number;
  /** The owned equipment this is, if it is equipment. */
  id?: number;
  /** gp per unit to buy it once you've run out, or null when it can't be bought (or needs earning, with that off). */
  unitCost: number | null;
}

/** Owned equipment counts as one of it, even when the bank export doesn't list it (worn gear added by hand). */
const withOwnedEquipment = (ownedIds: number[], quantities: OwnedQuantities): OwnedQuantities => {
  const all = new Map(quantities);
  for (const p of ownedIds.map(itemById).filter(isDefined)) {
    const name = p.name.toLowerCase();
    all.set(name, Math.max(1, all.get(name) ?? 0));
  }
  return all;
};

/**
 * The owned parts each upgrade's price assumes, and how many of each you have. Every upgrade is priced as if it had
 * your bank to itself, so the path uses these to stop two upgrades both counting the same part as free.
 */
export const ownedParts = (
  upgrades: Upgrade[],
  ownedIds: number[],
  prices: PriceIndex,
  quantities: OwnedQuantities,
  includeEarned: boolean,
): { parts: Map<number, PartUse[]>; stock: Map<string, number> } => {
  const idByName = new Map(ownedIds.map((id) => [itemById(id)?.name.toLowerCase(), id]));
  const all = withOwnedEquipment(ownedIds, quantities);
  const parts = new Map(upgrades.flatMap((u) => {
    const uses = (u.parts ?? []).filter((p) => p.source === 'owned').map((p): PartUse => {
      const name = p.name.toLowerCase();
      const bought = partCost(p.name, p.quantity, prices);
      return {
        name,
        quantity: p.quantity,
        id: idByName.get(name),
        unitCost: bought && (includeEarned || !bought.earned) ? bought.cost / p.quantity : null,
      };
    });
    return uses.length ? [[u.itemIds[0], uses] as const] : [];
  }));
  const names = new Set([...parts.values()].flat().filter((p) => p.id === undefined).map((p) => p.name));
  return { parts, stock: new Map([...all].filter(([name]) => names.has(name))) };
};

export const buildCandidates = (ownedIds: number[], prices: PriceIndex, opts: CandidateOptions): Upgrade[] => {
  const ownedSet = new Set(ownedIds);
  const owned = ownedIds.map(itemById).filter(isDefined);
  const upgrades: Upgrade[] = [];
  const ownedQuantities = withOwnedEquipment(ownedIds, opts.ownedQuantities);

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

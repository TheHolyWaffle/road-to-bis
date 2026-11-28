import ky from 'ky';
import wikiRecipes from '../data/recipes.json';
import type { EquipmentPiece } from './dps-calc';
import { aliasIds, versionsOf } from './items';
import type { PriceVia, UpgradePart } from './types';

const API = 'https://prices.runescape.wiki/api/v1/osrs';

export interface GePrice {
  /** What buying takes: the latest instant-buy price. */
  buy: number;
  /** What selling gets, before tax: the latest instant-sell price. */
  sell: number;
}

export interface PriceIndex {
  byId: Map<number, GePrice>;
  idByName: Map<string, number>;
}

interface MappingEntry { id: number; name: string }
interface LatestEntry { high: number | null; low: number | null }

export const loadPrices = async (): Promise<PriceIndex> => {
  const [mapping, latest] = await Promise.all([
    ky.get(`${API}/mapping`).json<MappingEntry[]>(),
    ky.get(`${API}/latest`).json<{ data: Record<string, LatestEntry> }>(),
  ]);
  return indexPrices(mapping, latest.data);
};

export const indexPrices = (mapping: MappingEntry[], latest: Record<string, LatestEntry>): PriceIndex => {
  const byId = new Map<number, GePrice>();
  for (const [id, { high, low }] of Object.entries(latest)) {
    if (high || low) byId.set(Number(id), { buy: (high || low)!, sell: (low || high)! });
  }
  return {
    byId,
    idByName: new Map(mapping.map((m) => [m.name.toLowerCase(), m.id])),
  };
};

/** Untradeable items without a gp cost still take effort to get, but don't count as free. */
export const UNTRADEABLE_COST = 1;

interface Recipe {
  quantity: number;
  materials: { name: string; quantity: number }[];
}

/** Charged items the wiki has no recipe for, made from their tradeable uncharged form. */
const EXTRA_RECIPES: Record<string, Recipe[]> = {
  'toxic staff of the dead': [{ quantity: 1, materials: [{ name: 'Staff of the dead', quantity: 1 }, { name: 'Magic fang', quantity: 1 }] }],
  'trident of the swamp': [{ quantity: 1, materials: [{ name: 'Uncharged toxic trident', quantity: 1 }] }],
  'magma helm': [{ quantity: 1, materials: [{ name: 'Serpentine helm (uncharged)', quantity: 1 }, { name: 'Magma mutagen', quantity: 1 }] }],
  'tanzanite helm': [{ quantity: 1, materials: [{ name: 'Serpentine helm (uncharged)', quantity: 1 }, { name: 'Tanzanite mutagen', quantity: 1 }] }],
};

const RECIPES = new Map<string, Recipe[]>([
  ...Object.entries(wikiRecipes as Record<string, Recipe[]>).map(([name, r]) => [name.toLowerCase(), r] as const),
  ...Object.entries(EXTRA_RECIPES),
]);

/** Recipes can nest (Ghommal's avernic defender needs an Avernic defender, which needs a hilt); this bounds the depth. */
const MAX_DEPTH = 4;

const NAME_VARIANTS = [
  (n: string) => n,
  (n: string) => `${n} (uncharged)`,
  (n: string) => `${n} (inactive)`,
  (n: string) => `${n} (empty)`,
  (n: string) => `${n} (damaged)`,
];

/** Lowercase item name to the quantity owned, across the whole bank and not just equipment. */
export type OwnedQuantities = Map<string, number>;

export interface PriceQuote {
  cost: number;
  via: PriceVia;
  /** For a GE item, what it sells for before tax. */
  sell?: number;
  /** What a crafted item is made from, flattened across nested recipes. */
  parts?: UpgradePart[];
}

/** An item name's GE prices, trying its uncharged and other plain variants. */
const geByName = (name: string, idx: PriceIndex) => {
  const lower = name.toLowerCase();
  for (const variant of NAME_VARIANTS) {
    const id = idx.idByName.get(variant(lower));
    const price = id === undefined ? undefined : idx.byId.get(id);
    if (price) return price;
  }
  return undefined;
};

interface Made {
  cost: number;
  parts: UpgradePart[];
}

const better = (a: Made, b: Made | null) => {
  if (!b) return true;
  if (a.cost !== b.cost) return a.cost < b.cost;
  const earned = (m: Made) => m.parts.filter((p) => p.source === 'earned').length;
  return earned(a) < earned(b);
};

/** The cheapest way to make `quantity` of an item from a recipe, or null when it has no usable recipe. */
const make = (name: string, quantity: number, idx: PriceIndex, owned: OwnedQuantities, depth: number, visiting: Set<string>): Made | null => {
  const lower = name.toLowerCase();
  if (depth > MAX_DEPTH) return null;
  let best: Made | null = null;
  for (const recipe of RECIPES.get(lower) ?? []) {
    const batches = Math.ceil(quantity / recipe.quantity);
    const made: Made = { cost: 0, parts: [] };
    let possible = true;
    for (const m of recipe.materials) {
      const part = acquire(m.name, m.quantity * batches, idx, owned, depth + 1, new Set([...visiting, lower]));
      if (!part) {
        possible = false;
        break;
      }
      made.cost += part.cost;
      made.parts.push(...part.parts);
    }
    if (possible && better(made, best)) best = made;
  }
  return best;
};

const acquire = (name: string, quantity: number, idx: PriceIndex, owned: OwnedQuantities, depth: number, visiting: Set<string>): Made | null => {
  const lower = name.toLowerCase();
  // An item can't be part of its own recipe, e.g. via an ornamented version that's made from it.
  if (visiting.has(lower)) return null;
  // Some recipes take a gp fee, e.g. paying an NPC; owning coins doesn't make that free.
  if (lower === 'coins') return { cost: quantity, parts: [{ name, quantity, source: 'buy' }] };
  if ((owned.get(lower) ?? 0) >= quantity) return { cost: 0, parts: [{ name, quantity, source: 'owned' }] };
  const price = geByName(name, idx);
  if (price) return { cost: price.buy * quantity, parts: [{ name, quantity, source: 'buy' }] };
  // A part with recipes that can't be made on this route (it would loop back on itself) rules the route out; only a
  // part with no recipe at all is untradeable and earned.
  if (RECIPES.has(lower)) return make(name, quantity, idx, owned, depth, visiting);
  return { cost: 0, parts: [{ name, quantity, source: 'earned' }] };
};

/**
 * How well another version's price stands in for this item's: working versions first, then ones that only need
 * charging or activating, and broken or damaged ones (which need repairs) last.
 */
const versionPriceRank = (version: string) => {
  if (/broken|damaged|degraded|^0$/i.test(version)) return 2;
  if (/uncharged|empty|inactive/i.test(version)) return 1;
  return 0;
};

const priceableIds = (piece: EquipmentPiece) => [
  piece.id,
  ...aliasIds(piece.id),
  ...versionsOf(piece).filter((v) => v.id !== piece.id).sort((a, b) => versionPriceRank(a.version) - versionPriceRank(b.version)).map((v) => v.id),
];

/** Combines repeats of a part, e.g. the demon tears each Avernic treads infusion needs. */
const mergeParts = (parts: UpgradePart[]) => {
  const merged = new Map<string, UpgradePart>();
  for (const p of parts) {
    const key = `${p.source}|${p.name}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + p.quantity } : { ...p });
  }
  return [...merged.values()];
};

/**
 * What `quantity` of a recipe part costs when you don't own any, and whether getting it means earning an untradeable.
 * Null when it can't be got at all.
 */
export const partCost = (name: string, quantity: number, idx: PriceIndex): { cost: number; earned: boolean } | null => {
  const got = acquire(name, quantity, idx, new Map(), 0, new Set());
  return got && { cost: got.cost, earned: got.parts.some((p) => p.source === 'earned') };
};

/**
 * Prices an item at its GE price, or else at the cheapest way to make it from tradeable parts, where parts in your
 * bank cost nothing. Returns null for an untradeable item with no recipe.
 */
export const priceFor = (piece: EquipmentPiece, idx: PriceIndex, owned: OwnedQuantities = new Map()): PriceQuote | null => {
  const ge = (p: GePrice): PriceQuote => ({ cost: p.buy, sell: p.sell, via: 'ge' });
  for (const id of priceableIds(piece)) {
    const p = idx.byId.get(id);
    if (p) return ge(p);
  }
  const imbuedBase = piece.name.match(/^(.*?) ?\(i\)$/)?.[1];
  if (imbuedBase && owned.has(imbuedBase.toLowerCase())) {
    return { cost: 0, via: 'imbue', parts: [{ name: imbuedBase, quantity: 1, source: 'owned' }] };
  }
  const byName = geByName(piece.name, idx);
  if (byName) return ge(byName);

  const made = make(piece.name, 1, idx, owned, 0, new Set());
  if (!made) return null;
  made.parts = mergeParts(made.parts);
  if (made.cost > 0) return { cost: made.cost, via: 'recipe', parts: made.parts };
  if (made.parts.every((p) => p.source === 'owned')) return { cost: 0, via: 'owned-parts', parts: made.parts };
  return { cost: UNTRADEABLE_COST, via: 'untradeable', parts: made.parts };
};

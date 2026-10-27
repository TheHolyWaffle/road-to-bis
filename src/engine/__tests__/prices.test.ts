import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCandidates } from '../candidates';
import { representatives } from '../items';
import { indexPrices, priceFor } from '../prices';
import { FAMILIES } from '../types';
import { sampleBank } from './fixtures';

const mappingFile = new URL('../../../scratch/mapping.json', import.meta.url);
const latestFile = new URL('../../../scratch/latest.json', import.meta.url);

describe.skipIf(!existsSync(mappingFile))('crafted item prices', () => {
  const mapping = JSON.parse(readFileSync(mappingFile, 'utf8'));
  const prices = indexPrices(mapping, JSON.parse(readFileSync(latestFile, 'utf8')).data);
  const ge = (name: string) => prices.byId.get(prices.idByName.get(name.toLowerCase())!)!;
  const item = (name: string) => representatives.find((r) => r.name === name)!;

  it('prices a crafted item at its parts, minus the ones you own', () => {
    const owned = new Map([['helm of neitiznot', 1]]);
    expect(priceFor(item('Neitiznot faceguard'), prices, owned)).toEqual({
      cost: ge('Basilisk jaw'),
      via: 'recipe',
      parts: [{ name: 'Helm of Neitiznot', quantity: 1, source: 'owned' }, { name: 'Basilisk jaw', quantity: 1, source: 'buy' }],
    });
    expect(priceFor(item('Neitiznot faceguard'), prices)?.cost).toBe(ge('Basilisk jaw') + ge('Helm of Neitiznot'));
  });

  it('prices the working version rather than a broken one', () => {
    expect(priceFor(item('Blood Moon helm'), prices)?.cost).toBe(ge('Blood Moon helm'));
    expect(priceFor(item('Blood Moon tassets'), prices)?.cost).toBe(ge('Blood Moon tassets'));
  });

  it('skips recipes that loop back on themselves', () => {
    // Crystal body (Amlodd) is made from a Crystal body, so that route can't be how you get one.
    const quote = priceFor(item('Crystal body'), prices)!;
    expect(quote.via).toBe('recipe');
    expect(quote.cost).toBeGreaterThanOrEqual(3 * ge('Crystal armour seed'));
  });

  it('is free when you own every part', () => {
    const owned = new Map([['helm of neitiznot', 1], ['basilisk jaw', 1]]);
    expect(priceFor(item('Neitiznot faceguard'), prices, owned)?.via).toBe('owned-parts');
  });

  it('follows nested recipes and needs enough of a stackable part', () => {
    const quote = priceFor(item("Ghommal's avernic defender 5"), prices, new Map([['dragon defender', 1]]))!;
    expect(quote.cost).toBe(ge('Avernic defender hilt'));
    const ward = (souls: number) => priceFor(item("Elidinis' ward (f)"), prices, new Map([["elidinis' ward", 1], ['soul rune', souls]]))!;
    expect(ward(10_000).cost).toBe(ge('Arcane sigil'));
    expect(ward(500).cost).toBe(ge('Arcane sigil') + 10_000 * ge('Soul rune'));
  });

  it('counts gp fees in recipes even when you have the coins', () => {
    const withCoins = priceFor(item('Crystal halberd'), prices, new Map([['coins', 1e9]]))!;
    expect(withCoins.cost).toBeGreaterThan(0);
    expect(withCoins.cost).toBe(priceFor(item('Crystal halberd'), prices)!.cost);
  });

  it('lists crafted upgrades for the sample bank', () => {
    const { ownedIds, quantities } = sampleBank();
    const upgrades = buildCandidates(ownedIds, prices, {
      families: FAMILIES, excluded: new Set(), ownedQuantities: quantities, includeEarned: true,
    });
    const crafted = upgrades.filter((u) => u.priceVia === 'recipe' || u.priceVia === 'owned-parts');
    console.log(crafted.map((u) => `${u.label}: ${(u.cost / 1e6).toFixed(2)}M ${u.priceVia} [${(u.parts ?? []).map((p) => `${p.source}:${p.quantity > 1 ? `${p.quantity} ` : ''}${p.name}`).join(', ')}]`).join('\n'));
    expect(crafted.find((u) => u.label === 'Neitiznot faceguard')?.parts?.find((p) => p.name === 'Helm of Neitiznot')?.source).toBe('owned');
  });
});

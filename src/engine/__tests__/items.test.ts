import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  itemById, representatives, resolveBankItem, SPECIAL_ITEM_NAMES, weaponFamilies,
} from '../items';

describe('items', () => {
  it('finds special items from engine source', () => {

    expect(SPECIAL_ITEM_NAMES.has('Twisted bow')).toBe(true);
  });

  it('resolves bank rows', () => {
    const rows = readFileSync(new URL('../../../sample-bank.tsv', import.meta.url), 'utf8').trim().split('\n').slice(1)
      .map((l) => l.split('\t'));
    const resolved = rows.map(([id, name]) => [name, resolveBankItem(Number(id), name)] as const).filter(([, r]) => r !== null);

    expect(resolved.length).toBeGreaterThan(250);
  });

  it('classifies weapons', () => {
    expect(weaponFamilies(itemById(20997)!)).toEqual(['ranged']);
    expect(weaponFamilies(itemById(27275)!)).toEqual(['magic']);
  });

  it('leaves out seasonal-only items but keeps regular gear', () => {
    const names = new Set(representatives.map((r) => r.name));
    for (const seasonal of ["King's barrage", "Devil's element", "Vesta's chainbody (Deadman Mode)", 'Corrupted twisted bow']) {
      expect(names.has(seasonal), seasonal).toBe(false);
    }
    for (const regular of ['Twisted bow', 'Infernal cape', 'Swift blade', "Dizana's quiver", 'Emberlight']) {
      expect(names.has(regular), regular).toBe(true);
    }
  });
});

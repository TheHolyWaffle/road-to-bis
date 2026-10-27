import { resolveBankItem } from '../engine/items';

export interface ParsedBank {
  ownedIds: number[];
  /** Every bank item by lowercase name, including non-equipment such as crafting materials. */
  quantities: Map<string, number>;
  rows: number;
}

/** Parses "id<TAB>name<TAB>quantity" rows, as exported by the Bank Memory plugin. A header row is skipped. */
export const parseBank = (text: string): ParsedBank => {
  const ids = new Set<number>();
  const quantities = new Map<string, number>();
  let rows = 0;
  for (const line of text.split(/\r?\n/)) {
    const [idRaw, name = '', quantityRaw = '1'] = line.split(/\t|,(?=\D)/);
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) continue;
    rows++;
    const key = name.trim().toLowerCase();
    quantities.set(key, (quantities.get(key) ?? 0) + (Number(quantityRaw) || 1));
    const resolved = resolveBankItem(id, name);
    if (resolved !== null) ids.add(resolved);
  }
  return { ownedIds: [...ids], quantities, rows };
};

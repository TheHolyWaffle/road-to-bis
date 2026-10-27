// Collects the OSRS Wiki's "Recommended equipment" tables (e.g. on Vorkath/Strategies) as item names per slot and tier,
// to benchmark the search against. Run with `npm run fetch-recommended-equipment` and commit the regenerated
// src/data/recommended-equipment.json.
import { writeFileSync } from 'node:fs';
import { fetchBucket } from './wiki-api.mjs';

const SLOTS = {
  head: 'head', neck: 'neck', cape: 'cape', body: 'body', legs: 'legs', weapon: 'weapon', '2h': 'weapon',
  shield: 'shield', ammo: 'ammo', hands: 'hands', feet: 'feet', ring: 'ring',
};

const linkedNames = (wikitext) => [...wikitext.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
  .map((m) => m[1].trim())
  .filter((n) => !/^(File|Category):/i.test(n));

const tables = [];
for (const row of await fetchBucket('recommended_equipment', ['page_name', 'json'])) {
  const json = JSON.parse(row.json);
  const slots = {};
  for (const [slot, tiers] of Object.entries(json['Recommended Equipment'] ?? {})) {
    const ours = SLOTS[slot];
    if (!ours) continue;
    // A weapon table can list one-handed and two-handed weapons in separate rows; tier n of each is merged.
    tiers.forEach((tier, i) => {
      const names = linkedNames(tier);
      if (!names.length) return;
      slots[ours] ??= [];
      slots[ours][i] = [...new Set([...(slots[ours][i] ?? []), ...names])];
    });
  }
  for (const s of Object.keys(slots)) slots[s] = slots[s].filter(Boolean);
  if (Object.keys(slots).length) tables.push({ page: row.page_name, style: json.style ?? null, slots });
}
tables.sort((a, b) => a.page.localeCompare(b.page) || String(a.style).localeCompare(String(b.style)));
writeFileSync(new URL('../src/data/recommended-equipment.json', import.meta.url), `${JSON.stringify(tables)}\n`);
console.log(`${tables.length} tables from ${new Set(tables.map((t) => t.page)).size} pages`);

// Collects OSRS Wiki recipes for equipment, and recursively for their materials, so untradeable gear can be priced by
// the tradeable parts it's made from. Run with `npm run fetch-recipes` and commit the regenerated src/data/recipes.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchBucket } from './wiki-api.mjs';

const recipes = new Map();
for (const row of await fetchBucket('recipe', ['production_json'])) {
  const p = JSON.parse(row.production_json);
  if (!p.output?.name || !p.materials?.length) continue;
  const recipe = {
    quantity: Number(p.output.quantity) || 1,
    materials: p.materials.map((m) => ({ name: m.name, quantity: Number(m.quantity) || 1 })),
  };
  if (!recipes.has(p.output.name)) recipes.set(p.output.name, []);
  recipes.get(p.output.name).push(recipe);
}

const equipment = JSON.parse(readFileSync(new URL('../vendor/osrs-dps-calc/cdn/json/equipment.json', import.meta.url), 'utf8'));
const wanted = new Set(equipment.map((e) => e.name));
const out = {};
for (let frontier = [...wanted]; frontier.length;) {
  const next = [];
  for (const name of frontier) {
    if (out[name] || !recipes.has(name)) continue;
    out[name] = recipes.get(name);
    for (const r of out[name]) for (const m of r.materials) if (!wanted.has(m.name)) { wanted.add(m.name); next.push(m.name); }
  }
  frontier = next;
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL('../src/data/recipes.json', import.meta.url), `${JSON.stringify(sorted)}\n`);
console.log(`${Object.keys(sorted).length} items with recipes, from ${recipes.size} recipe outputs`);

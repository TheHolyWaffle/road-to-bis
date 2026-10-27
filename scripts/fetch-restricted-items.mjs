// Collects names of items from OSRS Wiki categories, in two groups:
// - seasonal: only exist in seasonal game modes (leagues, Deadman seasons, Grid Master)
// - minigame: PvP minigame rewards (Emir's Arena, Last Man Standing, Bounty Hunter)
// Run with `npm run fetch-restricted-items` and commit the regenerated src/data/restricted-items.json.
import { writeFileSync } from 'node:fs';
import ky from 'ky';
import { API, HEADERS } from './wiki-api.mjs';

const MINIGAME_CATEGORIES = ["Emir's Arena", 'Last Man Standing', 'Bounty Hunter'];

const query = async (params) => {
  const results = [];
  let cont = {};
  do {
    const res = await ky.get(API, { searchParams: { action: 'query', format: 'json', ...params, ...cont }, headers: HEADERS }).json();
    results.push(res.query);
    cont = res.continue ?? null;
  } while (cont);
  return results;
};

const categoryMembers = async (category, type) => (await query({
  list: 'categorymembers', cmtitle: `Category:${category}`, cmtype: type, cmlimit: '500',
})).flatMap((q) => q.categorymembers.map((m) => m.title.replace(/^Category:/, '')));

const categoriesWithPrefix = async (prefix) => (await query({ list: 'allcategories', acprefix: prefix, aclimit: '500' }))
  .flatMap((q) => q.allcategories.map((c) => c['*']));

const pagesIn = async (categories) => {
  const names = new Set();
  for (const category of categories) {
    for (const title of await categoryMembers(category, 'page')) names.add(title);
  }
  return [...names].filter((n) => !n.includes('/')).sort();
};

const seasonalCategories = [
  ...await categoryMembers('Leagues', 'subcat'),
  ...await categoriesWithPrefix('Deadman'),
  ...await categoriesWithPrefix('Grid Master'),
];
const out = { seasonal: await pagesIn(seasonalCategories), minigame: await pagesIn(MINIGAME_CATEGORIES) };
writeFileSync(new URL('../src/data/restricted-items.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`seasonal: ${out.seasonal.length} names from ${seasonalCategories.join(', ')}`);
console.log(`minigame: ${out.minigame.length} names from ${MINIGAME_CATEGORIES.join(', ')}`);

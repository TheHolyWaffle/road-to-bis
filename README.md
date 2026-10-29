# Road to BiS

Plans your Old School RuneScape gear upgrades from your own bank to best in slot, best value first, across the
monsters you fight: what to buy, in what order, and what to sell once it's replaced.

DPS comes from the [OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) engine, which is vendored
as a git submodule and imported directly. Prices come from the [OSRS Wiki real-time prices API](https://prices.runescape.wiki/).

It runs entirely in your browser and is hosted on GitHub Pages: <https://theholywaffle.github.io/road-to-bis/>.

## Running it

```sh
git submodule update --init
npm install
npm run dev
```

Then:

1. Paste your bank export (the [Bank Memory](https://runelite.net/plugin-hub/show/bank-memory) plugin's `Item id / Item name / Item quantity` format). Worn gear isn't in
   a bank export, so add it with the search box.
2. Set your levels (or look them up by username), prayers, boosts and spellbooks.
3. Add the monsters you fight, or a preset such as a full raid. Choose the styles you'd use at each monster, its weight
   (how much of your time goes there) and whether you're on a slayer task. Raid bosses also take the party size (CoX, ToB) or
   raid level (ToA); changing it on one boss changes it for the whole raid.
4. Select **Plan my upgrades**. Set a budget on the results to
   see how far it gets you.

Everything you enter is saved in the browser and survives a refresh; search results aren't kept. The dev
server always runs on port 5173, because browser storage is tied to the address.

The hiscores lookup goes through [Wise Old Man](https://wiseoldman.net/), because the hiscores API has no CORS
headers.

`npm test` runs the engine tests. Some need price snapshots in `scratch/` and are skipped without them:

```sh
mkdir -p scratch
curl -A 'road-to-bis' https://prices.runescape.wiki/api/v1/osrs/mapping -o scratch/mapping.json
curl -A 'road-to-bis' https://prices.runescape.wiki/api/v1/osrs/latest -o scratch/latest.json
```

## How the search works

Rather than asking "which single item improves my current setup most", which never finds value that needs several
purchases (switching style, completing a set), the search maps how far gp can take each style at each monster, then
plans a route through those maps. It runs on a pool of web workers:

1. **Cost curves.** For every monster and combat style, find the best loadout from gear you own, and the best loadout at
   every price: the optimizer maximises DPS minus a gp penalty, swept from "only if it's nearly free" down to zero
   (best in slot). Each weapon is scored with its best stance, spell and ammo, then coordinate ascent swaps one slot at
   a time; sets that only pay off when complete (void, Masori, Torva, …) are tried as starting points. Each loadout on
   the curve also gets build orders: adding its items one at a time, most score per gp first, and dropping them one at
   a time, least score lost per gp first. That covers buying the key item of a bundle (say, a Tumeken's shadow) on its
   own.
2. **Gear for every monster at once.** Per style, a joint search buys items for all your monsters together: each
   purchase is the item (or curve item set) that adds the most speed summed over every monster, less the same gp
   penalty swept from stingy to generous. That finds gear that's never the best value at any one monster but is
   good at all of them, like a ring or cape every fight wants.
3. **Cross-checks.** Every item set found for one monster, or by the joint search, is tried at every other monster in
   the same style, so an item bought for Graardor is valued at Kree'arra too.
4. **Path.** Starting from your gear, repeatedly take the step that adds the most speed per gp: whatever moves one
   monster to a better loadout, counting its effect at every monster. A step can be one item or several that only pay
   off together. Such a bundle is then split into the smallest parts that each pay off on their own, so only items
   that are worthless without each other share a step: a Masori body is slower than your elite void top until the
   void set bonus is gone anyway. Speed is measured per fight as how much faster a kill is than now, then averaged by
   weight, so a slow kill counts as much as a fast one. Steps that cost nothing after selling come first, by how much
   they help.
5. **Refining the order.** The best step now isn't always the best order: a pricier step can make the next ones
   cheap. So the path is then rebuilt by beam search, which keeps the four best paths so far, tries each one's four
   best next steps, and scores every path by finishing it step by step as above. Paths score by how much faster they
   are on average over every budget, with each doubling of the budget counting the same, so being fast at 50M matters
   as much as at 5B. The step-by-step path shows first while this runs in a background worker.

**Fights in phases.** The *all phases* presets (Zulrah, Alchemical Hydra, Kalphite Queen) and the raids add each
phase or boss as its own monster, grouped into one fight. Each phase gets its own best style and setup, as if you
switched gear completely, and the fight is scored by the time a whole kill takes: the HP you deal in each phase over
your DPS there. Phases listed with the whole boss's HP, like Hydra's, take an HP per kill instead. A phase no setup
you own can damage counts as taking ten times as long as in best in slot.

With **Sell what's replaced** on, gear is sold (after the 2% GE tax) once no style at any monster still wears it and no
better loadout on a cost curve needs it. Only gear the path has worn is sold, so spec weapons and other items for
content that isn't modelled stay put. Making an item from one you own (an imbue, a Neitiznot faceguard) uses that item
up.

`npm run benchmark` builds a path for the sample bank against eight bosses and writes `scratch/benchmark.txt`: each
style's cost curve and best-in-slot loadout, every best-in-slot item tagged with its tier in the OSRS Wiki's
recommended equipment table for that boss and style, and the path. Refresh those tables with
`npm run fetch-recommended-equipment`.

`npm run path-check` writes `scratch/path-check.txt`: the sample bank's path at Vorkath, each step's speed-up next to the
best loadout the search found for the same gp, and greedy paths against beam-search paths there and at the eight bosses.

Pricing:

- Charged or degradable items are priced as their uncharged tradeable form.
- Untradeables that can be made are priced at the cheapest recipe from the OSRS Wiki, following nested recipes. Parts
  in your bank cost nothing, as long as you have enough of them: the whole bank counts, not just equipment. With a
  Helm of Neitiznot in your bank, a Neitiznot faceguard costs one Basilisk jaw. Untradeable parts and currencies such
  as NMZ points count as earned rather than bought, and gp fees count in full. Refresh the recipes with
  `npm run fetch-recipes`.
- Imbued versions of items you own count as free.
- Other untradeables count as 1 gp. Items that need an untradeable you'd have to earn are only planned with
  **Untradeables to earn** on.
- Seasonal items (leagues, Deadman seasons, Grid Master) are left out everywhere, and untradeable PvP-minigame rewards
  (Emir's Arena, Last Man Standing, Bounty Hunter) are never suggested. Both lists come from OSRS Wiki categories; refresh them with
  `npm run fetch-restricted-items`.
- Ammo and darts count as consumables, not upgrades.

## Known limits

- Gear switches are free and unlimited: each phase of a fight gets a full setup of its own, with no limit on
  inventory space or switch ticks, and no sharing of armour between styles.
- Item level requirements aren't in the engine's data. Use *Don't suggest this* for gear you can't wear yet.
- DPS is for the main attack only: special attacks, defence reduction and prayer upkeep aren't counted.
- The path only considers loadouts the search found. The joint search adds one item or curve item set at a time, so it
  can still miss a set whose value only shows once several monsters' needs are combined, and a monster's loadout after a step is the best one the search already found with the items
  held, not a fresh search. The beam search improves the order but doesn't guarantee the best one.
- Effects that depend on the monster's current HP are evaluated at half HP, unlike the wiki calculator's full-HP
  default. That's close to their average over a kill: at Vorkath, ruby dragon bolts (e) score 11.46 DPS this way, against
  11.28 over a whole kill and 12.01 at full HP. Turn on **Exact kill time** to re-score the setups the search finds by
  simulating whole kills from full HP. The search still picks setups at half HP, as simulating every setup it tries
  would take minutes; it adds about 40% to a search with ruby bolts, and more with Vardorvis.

## Deploying and data updates

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. Every Monday it also moves
the engine submodule to its latest commit and refetches the wiki data (`fetch-recipes`, `fetch-restricted-items` and
`fetch-recommended-equipment`), runs the tests, then commits the new data and deploys. When the tests fail nothing is
committed and the site keeps its last build. Run the workflow by hand from the Actions tab to update sooner.

Item and monster stats, recipes and the restricted item lists come with each build; GE prices are fetched live in the
browser.

## Updating the engine

```sh
git submodule update --remote vendor/osrs-dps-calc
```

Everything imported from the engine goes through `src/engine/dps-calc.ts`. Item effects the engine handles by name are
picked up from its source automatically.

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { BankStep } from './components/bank-step';
import { BudgetStep, type SearchOptions } from './components/budget-step';
import { EncountersPanel } from './components/encounters-panel';
import { MonstersStep } from './components/monsters-step';
import { PathView } from './components/path-view';
import { ProgressPanel } from './components/progress-panel';
import { StatsStep } from './components/stats-step';
import { buildCandidates, consumedParts, resaleValues } from './engine/candidates';
import { Potion } from './engine/dps-calc';
import {
  type Path, type PathInput, statesAfter, stepsWithin,
} from './engine/path';
import type { PathReply } from './engine/path-worker';
import { loadPrices, type PriceIndex } from './engine/prices';
import { type Progress, runSearch, type SearchOutput } from './engine/search';
import type { SearchContext } from './engine/task-runner';
import {
  type CombatSettings, FAMILIES, type MonsterSpec, type Objective,
} from './engine/types';
import { maxedSkills } from './engine/empty-player';
import { WorkerPool } from './engine/worker-pool';
import { itemById } from './engine/items';
import { parseBank } from './lib/bank';
import { plural } from './lib/format';
import { idbGet, idbSet } from './lib/idb-store';
import { usePersisted } from './lib/use-persisted';

const DEFAULT_SETTINGS: CombatSettings = {
  skills: maxedSkills(),
  unlocked: {
    piety: true, rigour: true, augury: true, deadeye: false, mysticVigour: false,
  },
  potions: { melee: [Potion.SUPER_COMBAT], ranged: [Potion.RANGING], magic: [Potion.SATURATED_HEART] },
  spellbooks: ['standard', 'ancient', 'arceuus'],
  anyAmmo: true,
  exactKillTime: false,
  foodPerTrip: 400,
  bankingSeconds: 120,
};

const DEFAULT_OPTIONS: SearchOptions = { objective: 'dps', includeEarned: false };

const LAST_RUN_KEY = 'last-path-run';

interface SearchRun {
  out: SearchOutput;
  monsters: MonsterSpec[];
  objective: Objective;
  ownedIds: number[];
  /** What each item you don't own cost when the search ran. */
  candidates: [id: number, cost: number][];
  /** GE prices of tradeable items, owned or not, for selling what the path replaces. */
  resale: [id: number, price: number][];
  consumes: [id: number, parts: number[]][];
  signature: string;
  durationMs: number;
}

type PriceState = { status: 'loading' } | { status: 'ready'; index: PriceIndex } | { status: 'error'; message: string };

export const App = () => {
  const [bankText, setBankText] = usePersisted('bank', '');
  const [extraIds, setExtraIds] = usePersisted<number[]>('extra-ids', []);
  const [removedIds, setRemovedIds] = usePersisted<number[]>('removed-ids', []);
  const [excludedIds, setExcludedIds] = usePersisted<number[]>('excluded-ids', []);
  const [settings, setSettings] = usePersisted('settings', DEFAULT_SETTINGS);
  const [rsn, setRsn] = usePersisted('rsn', '');
  const [monsters, setMonsters] = usePersisted<MonsterSpec[]>('monsters', []);
  const [options, setOptions] = usePersisted('search-options', DEFAULT_OPTIONS);
  const [budgetM, setBudgetM] = usePersisted<number | null>('budget-m', null);
  const [sell, setSell] = usePersisted('sell-replaced', true);

  const [prices, setPrices] = useState<PriceState>({ status: 'loading' });
  const [run, setRun] = useState<SearchRun | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const poolRef = useRef<WorkerPool | null>(null);
  const outputRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (running) outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [running]);

  useEffect(() => {
    loadPrices()
      .then((index) => setPrices({ status: 'ready', index }))
      .catch(() => setPrices({ status: 'error', message: 'Couldn\'t load prices from the OSRS Wiki. Check your connection and reload.' }));
    idbGet<SearchRun>(LAST_RUN_KEY)
      .then((saved) => { if (saved) setRun((current) => current ?? saved); })
      .catch(() => {});
  }, []);

  const bank = useMemo(() => parseBank(bankText), [bankText]);
  const ownedIds = useMemo(() => {
    const removed = new Set(removedIds);
    return [...new Set([...bank.ownedIds, ...extraIds])].filter((id) => !removed.has(id));
  }, [bank, extraIds, removedIds]);

  // Items left out of setups aren't available as crafting parts either.
  const ownedQuantities = useMemo(() => {
    const quantities = new Map(bank.quantities);
    for (const id of removedIds) {
      const name = itemById(id)?.name.toLowerCase();
      if (name) quantities.delete(name);
    }
    return quantities;
  }, [bank, removedIds]);

  const families = useMemo(() => FAMILIES.filter((f) => monsters.some((m) => m.families.includes(f))), [monsters]);
  const candidates = useMemo(() => (prices.status === 'ready'
    ? buildCandidates(ownedIds, prices.index, {
      families, excluded: new Set(excludedIds), ownedQuantities, includeEarned: options.includeEarned,
    })
    : null), [prices, ownedIds, families, excludedIds, ownedQuantities, options.includeEarned]);

  // Monster weights only affect the path, so changing them rebuilds it without a new search.
  const signature = useMemo(
    () => JSON.stringify([ownedIds, settings, options.objective, monsters.map((m) => [m.key, m.families, m.onTask, m.scaling]), candidates?.map((u) => u.key)]),
    [ownedIds, settings, options.objective, monsters, candidates],
  );

  const canRun = (() => {
    if (prices.status === 'loading') return 'Loading GE prices…';
    if (prices.status === 'error') return prices.message;
    if (!ownedIds.length) return 'Add your gear first.';
    if (!monsters.length) return 'Add at least one monster.';
    return null;
  })();

  const startSearch = async () => {
    if (!candidates || prices.status !== 'ready') return;
    poolRef.current?.terminate();
    const costs = candidates.map((u) => [u.itemIds[0], u.cost] as [number, number]);
    const ctx: SearchContext = {
      ownedIds, settings, monsters, candidates: costs,
    };
    const pool = new WorkerPool(ctx);
    poolRef.current = pool;
    setError(null);
    setProgress(null);
    setRunning(true);
    const started = Date.now();
    setStartedAt(started);
    try {
      const out = await runSearch({ monsters, objective: options.objective, ownedIds }, pool.run, (p) => setProgress(p));
      const finished: SearchRun = {
        out,
        monsters,
        objective: options.objective,
        ownedIds,
        candidates: costs,
        resale: [...resaleValues(ownedIds, prices.index, candidates)],
        consumes: [...consumedParts(candidates, ownedIds)],
        signature,
        durationMs: Date.now() - started,
      };
      setRun(finished);
      idbSet(LAST_RUN_KEY, finished).catch(() => {});
    } catch (e) {
      if (poolRef.current === pool) setError((e as Error).message);
    } finally {
      if (poolRef.current === pool) cancel();
    }
  };

  const cancel = () => {
    poolRef.current?.terminate();
    poolRef.current = null;
    setProgress(null);
    setRunning(false);
  };

  const pathInput = useMemo((): PathInput | null => {
    if (!run) return null;
    // Weights and how phases group into fights only affect the path, so they're taken from the current setup.
    const current = new Map(monsters.map((m) => [m.key, m]));
    const excluded = new Set(excludedIds);
    const owned = new Set(run.ownedIds);
    const keep = <T,>(entries: [number, T][]) => new Map(entries.filter(([id]) => !excluded.has(id)));
    return {
      monsters: run.monsters.map((m) => {
        const now = current.get(m.key);
        return now ? {
          ...m, weight: now.weight, encounter: now.encounter, hp: now.hp,
        } : m;
      }),
      frontiers: run.out.frontiers,
      objective: run.objective,
      ownedIds: run.ownedIds,
      buyCost: keep(run.candidates),
      resale: new Map(run.resale.filter(([id]) => !excluded.has(id) || owned.has(id))),
      consumes: keep(run.consumes),
      sell,
    };
  }, [run, monsters, excludedIds, sell]);

  // Built in a worker, as the wider search for a better order can take seconds. The last path stays up meanwhile.
  const [planned, setPlanned] = useState<{ input: PathInput; path: Path; refined: boolean } | null>(null);
  useEffect(() => {
    if (!pathInput) {
      setPlanned(null);
      return undefined;
    }
    const worker = new Worker(new URL('./engine/path-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PathReply>) => {
      if ('error' in e.data) setError(e.data.error);
      else setPlanned({ input: pathInput, path: e.data.path, refined: e.data.refined });
    };
    worker.postMessage(pathInput);
    return () => worker.terminate();
  }, [pathInput]);
  const path = pathInput ? planned?.path ?? null : null;
  const refining = !!pathInput && !(planned?.input === pathInput && planned.refined);

  const within = path ? stepsWithin(path, budgetM === null ? null : budgetM * 1e6) : 0;

  return (
    <div className="app">
      <header className="masthead">
        <h1>Road to BiS</h1>
        <p>
          Your path to best in slot, best value first: what to buy, and what to sell, for the monsters you fight. Uses the
          {' '}
          <a href="https://tools.runescape.wiki/osrs-dps/" target="_blank" rel="noreferrer">OSRS Wiki DPS calculator</a>
          {' '}
          and live GE prices.
        </p>
      </header>

      <div className="layout">
        <div className="setup">
          <BankStep
            bankText={bankText}
            onBankText={setBankText}
            bankRows={bank.rows}
            bankIds={bank.ownedIds}
            extraIds={extraIds}
            removedIds={removedIds}
            onRemovedIds={setRemovedIds}
          />
          <StatsStep settings={settings} onSettings={setSettings} rsn={rsn} onRsn={setRsn} />
          <MonstersStep monsters={monsters} onMonsters={setMonsters} />
          <BudgetStep
            options={options}
            onOptions={setOptions}
            settings={settings}
            onSettings={setSettings}
            canRun={canRun}
            running={running}
            onRun={startSearch}
            onCancel={cancel}
          />
          {candidates && !canRun && (
            <p className="hint">{`${plural(candidates.length, 'item')} you could get, across ${plural(monsters.length, 'monster')}.`}</p>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <main className="output" ref={outputRef}>
          {running && <ProgressPanel progress={progress} startedAt={startedAt} onCancel={cancel} />}
          {run && path ? (
            <>
              <EncountersPanel
                path={path}
                atBudget={budgetM === null ? null : statesAfter(path, within)}
                objective={run.objective}
              />
              <PathView
                path={path}
                objective={run.objective}
                budgetM={budgetM}
                onBudgetM={setBudgetM}
                within={within}
                sell={sell}
                onSell={setSell}
                stale={!running && run.signature !== signature}
                refining={refining}
                durationMs={run.durationMs}
                onBought={(step) => {
                  const gone = new Set([...step.sell, ...step.consumed]);
                  setExtraIds([...new Set([...extraIds.filter((id) => !gone.has(id)), ...step.buy])]);
                  setRemovedIds([...new Set([...removedIds.filter((id) => !step.buy.includes(id)), ...gone])]);
                }}
                onExclude={(ids) => setExcludedIds([...new Set([...excludedIds, ...ids])])}
              />
            </>
          ) : !running && (
            <div className="placeholder">
              <h2>No plan yet</h2>
              <p>
                Add your gear, levels and the monsters you fight above, then select Plan my upgrades. You&apos;ll get every
                step from your gear now to best in slot, ordered by how much faster you kill per gp.
              </p>
            </div>
          )}
        </main>
      </div>

      <footer className="colophon">
        {'Game data from '}
        <a href={`https://github.com/weirdgloop/osrs-dps-calc/commit/${__ENGINE_COMMIT__}`} target="_blank" rel="noreferrer">
          {`osrs-dps-calc ${__ENGINE_COMMIT__.slice(0, 7)}`}
        </a>
        {`, updated ${new Date(__BUILT_AT__).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
      </footer>
    </div>
  );
};

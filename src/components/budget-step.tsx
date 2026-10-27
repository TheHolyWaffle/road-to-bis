import type { CombatSettings, Objective } from '../engine/types';
import { InfoTip } from './info-tip';
import { Step } from './step';

export interface SearchOptions {
  objective: Objective;
  /** Also plan items that need an untradeable you'd have to earn, like the Infernal cape. */
  includeEarned: boolean;
}

interface Props {
  options: SearchOptions;
  onOptions: (o: SearchOptions) => void;
  settings: CombatSettings;
  onSettings: (s: CombatSettings) => void;
  canRun: string | null;
  running: boolean;
  onRun: () => void;
  onCancel: () => void;
}

export const BudgetStep = ({
  options, onOptions, settings, onSettings, canRun, running, onRun, onCancel,
}: Props) => (
  <Step index={4} title="Search">
    <div className="row">
      <div className="toggle-group" role="group" aria-label="Optimise for">
        <button type="button" className="toggle" aria-pressed={options.objective === 'dps'} onClick={() => onOptions({ ...options, objective: 'dps' })}>DPS</button>
        <button
          type="button"
          className="toggle"
          aria-pressed={options.objective === 'killsPerHour'}
          onClick={() => onOptions({ ...options, objective: 'killsPerHour' })}
        >
          Kills per hour
        </button>
      </div>
      <InfoTip label="optimise for">
        DPS: how fast you kill. Kills per hour: also counts how long your food lasts, so better defence means more kills
        per trip and less time banking. Each has its own best setups, e.g. Bandos over void when void&apos;s DPS edge
        isn&apos;t worth the extra damage you take.
      </InfoTip>
    </div>

    <label className="check">
      <input type="checkbox" checked={options.includeEarned} onChange={(e) => onOptions({ ...options, includeEarned: e.target.checked })} />
      Untradeables to earn
      <InfoTip label="untradeables to earn">
        Also plan items you earn rather than buy, such as the Infernal cape or Dizana&apos;s quiver, and items made with
        one. They count as almost free, so they come early in the path. Off: the path only has items you can buy.
      </InfoTip>
    </label>

    {options.objective === 'killsPerHour' && (
      <fieldset>
        <legend>
          Trips
          <InfoTip label="trips">
            The monster is assumed to attack with each of its combat styles equally, and you pray against whichever hurts
            most; a single-style monster always hits you. Better defence means less damage per kill, so your food lasts
            more kills before you bank. Special attacks and mechanics aren&apos;t modelled, so kills per trip is
            pessimistic, but it compares setups fairly.
          </InfoTip>
        </legend>
        <div className="budget">
          <label>
            <span>Food per trip</span>
            <input
              type="number"
              min={0}
              step={20}
              value={settings.foodPerTrip}
              onChange={(e) => onSettings({ ...settings, foodPerTrip: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="unit">HP healed, e.g. 20 sharks = 400</span>
          </label>
          <label>
            <span>Banking per trip</span>
            <input
              type="number"
              min={0}
              step={10}
              value={settings.bankingSeconds}
              onChange={(e) => onSettings({ ...settings, bankingSeconds: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="unit">seconds</span>
          </label>
        </div>
      </fieldset>
    )}

    <label className="check">
      <input type="checkbox" checked={settings.exactKillTime} onChange={(e) => onSettings({ ...settings, exactKillTime: e.target.checked })} />
      Exact kill time
      <InfoTip label="exact kill time">
        Some damage depends on the monster&apos;s HP, like ruby bolt procs, which shrink as it loses HP. Normally these
        setups are scored at half the monster&apos;s HP, which is fast and within about 2%. On: the setups the search
        finds are re-scored by simulating whole kills from full HP, so the DPS shown is exact. Slower.
      </InfoTip>
    </label>

    {running ? (
      <div className="row">
        <button type="button" className="primary" disabled>Searching…</button>
        <button type="button" className="quiet" onClick={onCancel}>Stop search</button>
      </div>
    ) : (
      <>
        <button type="button" className="primary" disabled={!!canRun} onClick={onRun}>Plan my upgrades</button>
        {canRun && <p className="hint">{canRun}</p>}
      </>
    )}
  </Step>
);

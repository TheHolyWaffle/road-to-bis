import type { CombatSettings } from '../engine/types';
import { InfoTip } from './info-tip';
import { Step } from './step';

export interface SearchOptions {
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
    <label className="check">
      <input type="checkbox" checked={options.includeEarned} onChange={(e) => onOptions({ ...options, includeEarned: e.target.checked })} />
      Untradeables to earn
      <InfoTip label="untradeables to earn">
        Also plan items you earn rather than buy, such as the Infernal cape or Dizana&apos;s quiver, and items made with
        one. They count as almost free, so they come early in the path. Off: the path only has items you can buy.
      </InfoTip>
    </label>

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

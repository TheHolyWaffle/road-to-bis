import { useState } from 'react';
import { monsterLabel } from '../engine/build-player';
import { itemById } from '../engine/items';
import {
  type EncounterState, killSeconds, type Path, type PathStep, statesAfter,
} from '../engine/path';
import { FAMILY_LABEL } from '../engine/types';
import {
  equipmentImage, formatDps, formatGp, formatPercent, formatSeconds, plural, wikiLink,
} from '../lib/format';
import { Gp } from './gp';
import { InfoTip } from './info-tip';
import { ItemIcon } from './item-icon';
import { LoadoutIcons } from './loadout-icons';
import { MonsterLink } from './monster-link';

interface Props {
  path: Path;
  /** In millions of gp; null shows the whole path. */
  budgetM: number | null;
  onBudgetM: (m: number | null) => void;
  /** How many steps fit the budget. */
  within: number;
  /** Sell gear once the path no longer uses it. */
  sell: boolean;
  onSell: (sell: boolean) => void;
  stale: boolean;
  /** Still looking for a better order than the one shown. */
  refining: boolean;
  durationMs?: number;
  onBought: (step: PathStep) => void;
  onExclude: (ids: number[]) => void;
}

const names = (ids: number[]) => ids.map((id) => itemById(id)?.name ?? `#${id}`).join(' + ');

const styleText = (s: EncounterState) => (s.family ? FAMILY_LABEL[s.family] : 'No usable setup');

const ItemLinks = ({ ids }: { ids: number[] }) => (
  <span className="upgrade-items">
    {ids.map((id) => {
      const item = itemById(id)!;
      return (
        <a key={id} className="wiki-item" href={wikiLink(item.name)} target="_blank" rel="noreferrer">
          <img src={equipmentImage(item.image)} alt="" />
          {item.name}
        </a>
      );
    })}
  </span>
);

const FightTimes = ({ path, before, after }: { path: Path; before: EncounterState[]; after: EncounterState[] }) => {
  const t0 = killSeconds(path, before);
  const t1 = killSeconds(path, after);
  const fights = path.encounters
    .map((e, k) => ({ e, from: t0[k], to: t1[k] }))
    .filter(({ e, from, to }) => e.phases.length > 1 && to < from - 1e-9);
  if (!fights.length) return null;
  return (
    <ul className="fight-times">
      {fights.map(({ e, from, to }) => (
        <li key={e.name}>
          {`${e.name}, whole kill: ${formatSeconds(from)} to ${formatSeconds(to)} `}
          <span className="up">{formatPercent(from / to - 1)}</span>
        </li>
      ))}
    </ul>
  );
};

const StepDetail = ({
  path, step, before, onBought, onExclude,
}: { path: Path; step: PathStep; before: EncounterState[]; onBought: () => void; onExclude: () => void }) => (
  <div className="upgrade-detail">
    <FightTimes path={path} before={before} after={step.states} />
    <table>
      <thead>
        <tr>
          <th scope="col">Monster</th>
          <th scope="col">Style</th>
          <th scope="col" className="num">Before (DPS)</th>
          <th scope="col" className="num">After</th>
          <th scope="col" className="num">Change</th>
        </tr>
      </thead>
      <tbody>
        {step.states.map((after, i) => {
          const b = before[i];
          const change = b.score > 0 ? after.score / b.score - 1 : 0;
          const changed = after.score > b.score + 1e-9;
          return [
            <tr key={after.monster}>
              <th scope="row"><MonsterLink monsterKey={after.monster} /></th>
              <td>{b.family === after.family ? styleText(after) : `${styleText(b)} to ${styleText(after)}`}</td>
              <td className="num">{formatDps(b.score)}</td>
              <td className="num">{formatDps(after.score)}</td>
              <td className={`num ${changed ? 'up' : 'muted'}`}>{changed ? formatPercent(change) : '–'}</td>
            </tr>,
            changed && (
              <tr key={`${after.monster}/loadout`} className="detail-loadout">
                <td colSpan={5}><LoadoutIcons loadout={after.loadout} highlight={step.buy} /></td>
              </tr>
            ),
          ];
        })}
      </tbody>
    </table>
    {step.consumed.length > 0 && (
      <div className="row">
        <span className="hint">Uses up your</span>
        <ItemLinks ids={step.consumed} />
      </div>
    )}
    {step.sell.length > 0 && (
      <div className="row">
        <span className="hint">Sell, as nothing on your path uses them any more:</span>
        <ItemLinks ids={step.sell} />
      </div>
    )}
    <div className="row">
      <ItemLinks ids={step.buy} />
      <button type="button" onClick={onBought}>I did this</button>
      <button type="button" className="quiet" onClick={onExclude}>Don&apos;t suggest these</button>
    </div>
  </div>
);

export const PathView = ({
  path, budgetM, onBudgetM, within, sell, onSell, stale, refining, durationMs, onBought, onExclude,
}: Props) => {
  const [open, setOpen] = useState<number | null>(null);
  const reached = within > 0 ? path.steps[within - 1] : null;
  const last = path.steps.at(-1);
  const maxGain = Math.max(1e-9, ...path.steps.map((s) => s.gain));

  return (
    <section className="results" aria-labelledby="results-title">
      <header className="results-head">
        <h2 id="results-title">Your path to best in slot</h2>
        <div className="results-controls">
          <label className="check">
            <input type="checkbox" checked={sell} onChange={(e) => onSell(e.target.checked)} />
            Sell what&apos;s replaced
            <InfoTip label="sell what's replaced">
              Gear sells back on the GE for close to what you paid, so a stepping stone costs little more than the 2% GE
              tax. On: once no style at any monster still uses an item, and no better setup on its way to best in slot
              does, the path sells it to pay for the next step. Gear the path never used, like spec weapons, is never sold.
            </InfoTip>
          </label>
          <label className="budget-inline">
            <span>Budget</span>
            <input
              type="number"
              min={0}
              placeholder="No limit"
              value={budgetM ?? ''}
              onChange={(e) => onBudgetM(e.target.value.trim() === '' ? null : Math.max(0, Number(e.target.value)))}
            />
            <span className="unit">M gp</span>
            <InfoTip label="budget">
              How much gp you can put in, after selling what the path replaces. Steps past your budget are dimmed, and
              the table above shows your setups once you&apos;ve done them.
            </InfoTip>
          </label>
        </div>
      </header>
      {stale && <p className="notice">Your gear, levels or monsters changed since this search. Run it again to update.</p>}
      <p className="hint">
        {last
          ? `Every step to best in slot, best value first: ${plural(path.steps.length, 'step')}, ${formatGp(last.totalSpent).text} gp in all, ${formatPercent(last.gain)} faster on average.`
          : 'Your gear is already the best this search could find.'}
        {budgetM !== null && ` With ${formatGp(budgetM * 1e6).text} gp: ${reached ? `${plural(within, 'step')}, ${formatPercent(reached.gain)} faster.` : 'not enough for the first step.'}`}
        {durationMs !== undefined && ` Search took ${(durationMs / 1000).toFixed(1)}s.`}
        {refining && ' Looking for a better order…'}
      </p>

      {path.steps.length > 0 && (
        <div className="upgrade-row upgrade-header">
          <span className="rank">#</span>
          <span className="upgrade-header-item">Buy</span>
          <span className="upgrade-cost">Cost</span>
          <span className="upgrade-total">Spent so far</span>
          <span className="upgrade-header-value">
            Faster on average
            <InfoTip label="faster on average">
              How much faster you kill, on average over your monsters and weighted by how much you fight each, than with
              your gear now. Each counts by its own speed-up, so a slow kill matters as much as a fast one. The phases of
              a fight count together, by how long a whole kill takes.
            </InfoTip>
          </span>
        </div>
      )}
      <ol className="upgrade-list">
        {path.steps.map((step, i) => {
          const isOpen = open === i;
          const before = statesAfter(path, i);
          const helped = path.encounters.filter((e) => e.phases.some((j) => step.states[j].score > before[j].score + 1e-9)).length;
          const toggle = () => setOpen(isOpen ? null : i);
          const net = step.spent - step.refunded;
          const overBudget = i >= within;
          return [
            budgetM !== null && i === within && (
              <li key="budget" className="budget-line">{`Over your ${formatGp(budgetM * 1e6).text} budget`}</li>
            ),
            <li
              key={i}
              className={[isOpen && 'is-open', overBudget && 'is-over'].filter(Boolean).join(' ') || undefined}
              style={{ borderLeft: `3px solid var(--${step.target.family})` }}
            >
              {/* Clicking anywhere on the row expands it; the rank button is the keyboard-accessible control. */}
              <div className="upgrade-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) toggle(); }}>
                <button type="button" className="rank" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} details for step ${i + 1}`} onClick={toggle}>
                  {i + 1}
                  <span className="chevron" aria-hidden />
                </button>
                <span className="upgrade-icons">
                  {step.buy.slice(0, 3).map((id) => <ItemIcon key={id} id={id} size={34} tabIndex={-1} />)}
                </span>
                <span className="upgrade-name">
                  <ul className="buy-list">
                    {step.buy.map((id, k) => (
                      <li key={id}>
                        <span className="buy-name">{names([id])}</span>
                        {step.buy.length > 1 && <Gp amount={step.costs[k]} />}
                      </li>
                    ))}
                  </ul>
                  {step.buy.length > 1 && (
                    <small className="together-note">
                      Only pays off together
                      <InfoTip label="only pays off together">
                        None of these is faster than what you have on its own, e.g. a Masori piece breaks your void set
                        bonus until the rest of the set (or a new weapon) makes up for it.
                      </InfoTip>
                    </small>
                  )}
                  <small>
                    {`For ${monsterLabel(step.target.monster)} (${FAMILY_LABEL[step.target.family].toLowerCase()})`}
                    {helped > 1 && `, helps ${helped} fights`}
                    {`, ${formatPercent(step.gain - (i === 0 ? 0 : path.steps[i - 1].gain))}`}
                  </small>
                  {step.sell.length > 0 && <small className="sell-note">{`Sell ${names(step.sell)}`}</small>}
                </span>
                <span className="upgrade-cost">
                  <Gp amount={Math.abs(net)} />
                  {net < 0 && <small>gp back</small>}
                  {step.refunded > 0 && <small>{`after selling for ${formatGp(step.refunded).text}`}</small>}
                </span>
                <span className="upgrade-total"><Gp amount={Math.max(0, step.totalSpent)} /></span>
                <span className="upgrade-value">
                  <span className="value-bar" aria-hidden><span style={{ width: `${Math.max(2, (step.gain / maxGain) * 100)}%` }} /></span>
                  <span className="value-number">{formatPercent(step.gain)}</span>
                </span>
              </div>
              {isOpen && (
                <StepDetail
                  path={path}
                  step={step}
                  before={before}
                  onBought={() => onBought(step)}
                  onExclude={() => onExclude(step.buy)}
                />
              )}
            </li>,
          ];
        })}
      </ol>
    </section>
  );
};

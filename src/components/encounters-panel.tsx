import { useState } from 'react';
import { type EncounterState, killSeconds, type Path } from '../engine/path';
import { FAMILY_LABEL, type Objective } from '../engine/types';
import { formatPercent, formatScore, formatSeconds } from '../lib/format';
import { InfoTip } from './info-tip';
import { LoadoutIcons } from './loadout-icons';
import { MonsterLink } from './monster-link';

interface Props {
  path: Path;
  /** After the steps that fit the budget, or null without a budget. */
  atBudget: EncounterState[] | null;
  objective: Objective;
}

export const EncountersPanel = ({
  path, atBudget, objective,
}: Props) => {
  const { start, bis } = path;
  const [open, setOpen] = useState<string | null>(null);
  const columns: [string, EncounterState[]][] = [['Now', start], ...(atBudget ? [['With budget', atBudget] as [string, EncounterState[]]] : []), ['Best in slot', bis]];

  const cell = (key: string, s: EncounterState, base: EncounterState) => (
    <td key={key} className="num">
      {s.family ? (
        <button type="button" className="link" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
          <span className={`style-dot family-${s.family}`} aria-hidden />
          {`${FAMILY_LABEL[s.family]} ${formatScore(s.score, objective)}`}
          {s !== base && base.score > 0 && s.score > base.score + 1e-9 && <small className="up">{` ${formatPercent(s.score / base.score - 1)}`}</small>}
        </button>
      ) : <span className="muted">–</span>}
    </td>
  );

  const seconds = columns.map(([, states]) => killSeconds(path, states));
  const phaseRows = (i: number, phase: boolean) => {
    const s = start[i];
    return [
      <tr key={s.monster} className={phase ? 'phase-row' : undefined}>
        <th scope="row"><MonsterLink monsterKey={s.monster} /></th>
        {columns.map(([label, states]) => cell(`${s.monster}/${label}`, states[i], s))}
      </tr>,
      ...columns.map(([label, states]) => open === `${s.monster}/${label}` && (
        <tr key={`${s.monster}/${label}/loadout`} className="baseline-loadout">
          <td colSpan={columns.length + 1}><LoadoutIcons loadout={states[i].loadout} /></td>
        </tr>
      )),
    ];
  };

  return (
    <details className="baseline" open>
      <summary>
        {`Your setups, in ${objective === 'dps' ? 'DPS' : 'kills per hour'}`}
        <InfoTip label="your setups">
          Your best style and setup at each monster now, after the steps your budget covers, and with everything on the
          path. Select one to see the gear. A fight in phases also shows how long a whole kill takes, adding up each
          phase&apos;s HP over your DPS there.
        </InfoTip>
      </summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Monster</th>
            {columns.map(([label]) => <th key={label} scope="col" className="num">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {path.encounters.map((e, k) => (e.phases.length === 1 && e.name === start[e.phases[0]].monster
            ? phaseRows(e.phases[0], false)
            : [
              <tr key={`fight:${e.name}`} className="fight-row">
                <th scope="row">{`${e.name}, whole kill`}</th>
                {seconds.map((t, c) => (
                  <td key={columns[c][0]} className="num">
                    {formatSeconds(t[k])}
                    {c > 0 && t[k] > 0 && t[k] < seconds[0][k] - 1e-9 && <small className="up">{` ${formatPercent(seconds[0][k] / t[k] - 1)}`}</small>}
                  </td>
                ))}
              </tr>,
              ...e.phases.flatMap((i) => phaseRows(i, true)),
            ]))}
        </tbody>
      </table>
    </details>
  );
};

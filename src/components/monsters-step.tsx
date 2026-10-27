import { useMemo } from 'react';
import {
  allMonsters, fullHp, monsterByKey, monsterKey, monsterLabel, monsterLevel,
} from '../engine/build-player';
import { isDefined } from '../engine/dps-calc';
import {
  FAMILIES, FAMILY_LABEL, fightsOf, type MonsterSpec,
} from '../engine/types';
import { monsterImage, plural } from '../lib/format';
import {
  type Fight, FIGHTS, findMonsterKey, type MonsterRef, PRESETS, type Raid, RAIDS, raidByKey, taskOnly,
} from '../lib/monster-presets';
import { InfoTip } from './info-tip';
import { MonsterLink } from './monster-link';
import { SearchPicker } from './search-picker';
import { Step } from './step';

interface Props {
  monsters: MonsterSpec[];
  onMonsters: (m: MonsterSpec[]) => void;
}

const newSpec = (key: string): MonsterSpec => ({
  key, weight: 1, families: [...FAMILIES], onTask: taskOnly(key), scaling: raidByKey.get(key)?.scaling,
});

export const MonstersStep = ({ monsters, onMonsters }: Props) => {
  const options = useMemo(() => allMonsters.map((m) => {
    const level = monsterLevel(monsterKey(m));
    return {
      key: monsterKey(m),
      label: m.name,
      detail: [m.version, level ? `level ${level}` : ''].filter(Boolean).join(', ') || undefined,
      image: monsterImage(m.image ?? ''),
    };
  }), []);
  const raidsInList = [...new Set(monsters.map((m) => raidByKey.get(m.key)).filter(isDefined))];

  const add = (specs: MonsterSpec[]) => {
    const existing = new Set(monsters.map((m) => m.key));
    onMonsters([...monsters, ...specs.filter((m) => !existing.has(m.key))]);
  };
  const update = (key: string, patch: Partial<MonsterSpec>) => onMonsters(monsters.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const updateFight = (encounter: string, patch: Partial<MonsterSpec>) => onMonsters(monsters.map((m) => (m.encounter === encounter ? { ...m, ...patch } : m)));

  const addPreset = (entries: MonsterRef[], encounter?: string) => add(entries.map(findMonsterKey).filter(isDefined).map((k) => ({ ...newSpec(k), encounter })));
  const addFight = (fight: Fight) => add(fight.phases.flatMap(({ ref, hp }) => {
    const key = findMonsterKey(ref);
    return key ? [{ ...newSpec(key), encounter: fight.name, hp }] : [];
  }));

  const groups = fightsOf(monsters).map(({ encounter, phases }) => ({ encounter, specs: phases.map((i) => monsters[i]) }));

  // Raid scaling applies to the whole raid, so editing it on one boss updates every boss from that raid.
  const setRaidScaling = (raid: Raid, value: number) => onMonsters(monsters.map((m) => (
    raidByKey.get(m.key) === raid ? { ...m, scaling: { ...m.scaling, [raid.scalingField]: value } } : m
  )));

  const row = (spec: MonsterSpec, inFight: boolean) => {
    const m = monsterByKey.get(spec.key);
    const raid = raidByKey.get(spec.key);
    return (
      <li key={spec.key}>
        {m?.image && <img src={monsterImage(m.image)} alt="" loading="lazy" />}
        <div className="monster-main">
          <span className="monster-name">
            <MonsterLink monsterKey={spec.key} />
            {monsterLevel(spec.key) ? <span className="monster-level">{`Level ${monsterLevel(spec.key)}`}</span> : null}
          </span>
          <div className="monster-controls">
            <div className="toggle-group" role="group" aria-label="Styles to consider">
              {FAMILIES.map((f) => {
                const on = spec.families.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    className={`toggle family-${f}`}
                    aria-pressed={on}
                    onClick={() => {
                      const families = on ? spec.families.filter((x) => x !== f) : FAMILIES.filter((x) => x === f || spec.families.includes(x));
                      if (families.length) update(spec.key, { families });
                    }}
                  >
                    {FAMILY_LABEL[f]}
                  </button>
                );
              })}
            </div>
            {inFight ? (
              <label className="weight">
                <span>HP</span>
                <input
                  type="number"
                  min={0}
                  className="hp"
                  placeholder={String(fullHp(spec.key, spec.scaling))}
                  value={spec.hp ?? ''}
                  onChange={(e) => update(spec.key, { hp: e.target.value.trim() === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
            ) : (
              <label className="weight">
                <span>Weight</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={spec.weight}
                  onChange={(e) => update(spec.key, { weight: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
            )}
            {raid && (
              <label className="weight">
                <span>{raid.scalingLabel}</span>
                <input
                  type="number"
                  min={raid.scalingMin}
                  max={raid.scalingMax}
                  step={raid.scalingStep}
                  value={spec.scaling?.[raid.scalingField] ?? raid.scaling[raid.scalingField]}
                  onChange={(e) => setRaidScaling(raid, Math.min(raid.scalingMax, Math.max(0, Number(e.target.value) || 0)))}
                />
              </label>
            )}
            {m?.is_slayer_monster && (
              <label className="check">
                <input type="checkbox" checked={spec.onTask} onChange={(e) => update(spec.key, { onTask: e.target.checked })} />
                On task
              </label>
            )}
          </div>
        </div>
        <button type="button" className="icon-button" aria-label={`Remove ${monsterLabel(spec.key)}`} onClick={() => onMonsters(monsters.filter((x) => x.key !== spec.key))}>×</button>
      </li>
    );
  };

  return (
    <Step index={3} title="What you fight" summary={monsters.length ? plural(monsters.length, 'monster') : undefined}>
      <SearchPicker label="Add a monster" placeholder="Add a boss or monster" options={options} onPick={(o) => add([newSpec(o.key)])} />
      <div className="chips">
        {PRESETS.map(([name, entries]) => (
          <button key={name} type="button" className="quiet" onClick={() => addPreset(entries)}>{`Add ${name}`}</button>
        ))}
        {FIGHTS.map((fight) => (
          <button key={fight.name} type="button" className="quiet" onClick={() => addFight(fight)}>{`Add ${fight.name} (all phases)`}</button>
        ))}
        {RAIDS.map((raid) => (
          <button key={raid.name} type="button" className="quiet" onClick={() => addPreset(raid.monsters, raid.name)}>{`Add ${raid.name}`}</button>
        ))}
      </div>
      {monsters.length > 1 && (
        <button type="button" className="link" onClick={() => onMonsters([])}>Remove all monsters</button>
      )}
      {monsters.length === 0 && <p className="hint">Add the monsters you kill most. The path aims to speed up all of them, each counting by its weight.</p>}
      {monsters.length > 0 && (
        <p className="monster-legend">
          <span>
            Styles
            <InfoTip label="styles">
              The combat styles you&apos;d use against this monster. Each one gets its own route to best in slot, so the path
              can switch you to another style when that&apos;s better value. Untick styles you&apos;d never use here.
            </InfoTip>
          </span>
          <span>
            Weight
            <InfoTip label="weight">
              How much of your time goes to this monster or fight. Set 2 for one you spend twice as long at, or 0 to ignore
              it. The phases of a fight share one weight, and count by how much of each kill they take. Changing weights
              rebuilds the path without a new search.
            </InfoTip>
          </span>
          {groups.some((g) => g.encounter) && (
            <span>
              HP per kill
              <InfoTip label="HP per kill">
                For a fight in phases, how much HP you take off in each phase, which sets how much of the kill it takes.
                Some phases are listed with the whole boss&apos;s HP (each Hydra phase shows 1,100), so set the share you
                actually deal there. Empty means its full HP.
              </InfoTip>
            </span>
          )}
          <span>
            On task
            <InfoTip label="on task">
              Whether you fight this monster on a slayer task, which turns on the slayer helmet and black mask bonus.
            </InfoTip>
          </span>
          {raidsInList.map((raid) => (
            <span key={raid.name}>
              {raid.scalingLabel}
              <InfoTip label={`${raid.name} ${raid.scalingLabel.toLowerCase()}`}>
                {raid.scalingHelp}
              </InfoTip>
            </span>
          ))}
        </p>
      )}
      <ul className="monster-list">
        {groups.map((group) => {
          if (!group.encounter) return row(group.specs[0], false);
          const { encounter } = group;
          return (
            <li key={`fight:${encounter}`} className="fight">
              <div className="fight-head">
                <span className="monster-name">{encounter}</span>
                <label className="weight">
                  <span>Weight</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={group.specs[0].weight}
                    onChange={(e) => updateFight(encounter, { weight: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </label>
                <button type="button" className="link" onClick={() => updateFight(encounter, { encounter: undefined, hp: undefined })}>
                  Count phases separately
                </button>
                <button type="button" className="icon-button" aria-label={`Remove ${encounter}`} onClick={() => onMonsters(monsters.filter((x) => x.encounter !== encounter))}>×</button>
              </div>
              <ul className="monster-list">{group.specs.map((spec) => row(spec, true))}</ul>
            </li>
          );
        })}
      </ul>
    </Step>
  );
};

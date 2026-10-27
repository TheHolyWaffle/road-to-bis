import { useState } from 'react';
import { calculateCombatLevel, Potion } from '../engine/dps-calc';
import type { PlayerSkills, Spellbook } from '../engine/dps-calc';
import { type CombatSettings, type Family, FAMILY_LABEL } from '../engine/types';
import { fetchSkills } from '../lib/hiscores';
import { usePersisted } from '../lib/use-persisted';
import { InfoTip } from './info-tip';
import { Step } from './step';

interface Props {
  settings: CombatSettings;
  onSettings: (s: CombatSettings) => void;
  rsn: string;
  onRsn: (rsn: string) => void;
}

const SKILLS: [keyof PlayerSkills, string][] = [
  ['atk', 'Attack'], ['str', 'Strength'], ['def', 'Defence'], ['ranged', 'Ranged'],
  ['magic', 'Magic'], ['prayer', 'Prayer'], ['hp', 'Hitpoints'],
];

const POTION_CHOICES: Record<Family, [string, Potion[]][]> = {
  melee: [['Super combat', [Potion.SUPER_COMBAT]], ['Smelling salts', [Potion.SMELLING_SALTS]], ['Overload (+)', [Potion.OVERLOAD_PLUS]], ['None', []]],
  ranged: [['Ranging potion', [Potion.RANGING]], ['Smelling salts', [Potion.SMELLING_SALTS]], ['Overload (+)', [Potion.OVERLOAD_PLUS]], ['None', []]],
  magic: [
    ['Saturated heart', [Potion.SATURATED_HEART]], ['Imbued heart', [Potion.IMBUED_HEART]], ['Magic potion', [Potion.MAGIC]],
    ['Forgotten brew', [Potion.FORGOTTEN_BREW]], ['Smelling salts', [Potion.SMELLING_SALTS]], ['Overload (+)', [Potion.OVERLOAD_PLUS]], ['None', []],
  ],
};

const PRAYERS: [keyof CombatSettings['unlocked'], string][] = [
  ['piety', 'Piety'], ['rigour', 'Rigour'], ['augury', 'Augury'], ['deadeye', 'Deadeye'], ['mysticVigour', 'Mystic Vigour'],
];

const SPELLBOOKS: [Spellbook, string][] = [['standard', 'Standard'], ['ancient', 'Ancient'], ['arceuus', 'Arceuus']];

export const StatsStep = ({
  settings, onSettings, rsn, onRsn,
}: Props) => {
  const [lookup, setLookup] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [lookedUpRsn, setLookedUpRsn] = usePersisted('looked-up-rsn', '');
  const lookedUp = !!rsn.trim() && lookedUpRsn.toLowerCase() === rsn.trim().toLowerCase();
  const set = (patch: Partial<CombatSettings>) => onSettings({ ...settings, ...patch });

  const lookUp = async () => {
    setLookup({ busy: true });
    try {
      set({ skills: await fetchSkills(rsn) });
      setLookedUpRsn(rsn.trim());
      setLookup({ busy: false });
    } catch (e) {
      setLookup({ busy: false, error: (e as Error).message });
    }
  };

  const { skills } = settings;
  return (
    <Step index={2} title="Stats and boosts" summary={`Combat level ${calculateCombatLevel(skills)}`}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (rsn.trim()) lookUp(); }}>
        {/* Not a login: keeps browsers and password managers from filling in or saving it. */}
        <input
          type="search"
          name="rsn"
          aria-label="RuneScape name"
          placeholder="RuneScape name"
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          value={rsn}
          onChange={(e) => onRsn(e.target.value)}
        />
        <button type="submit" disabled={lookup.busy || !rsn.trim()}>{lookup.busy ? 'Looking up…' : 'Look up levels'}</button>
        {lookedUp && !lookup.busy && (
          <svg className="looked-up" viewBox="0 0 16 16" width="18" height="18" role="img" aria-label={`Levels loaded for ${rsn.trim()}`}>
            <title>{`Levels loaded for ${rsn.trim()}`}</title>
            <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <InfoTip label="looking up levels">
          Fills in your levels from the OSRS hiscores, through Wise Old Man.
        </InfoTip>
      </form>
      {lookup.error && <p className="error">{lookup.error}</p>}

      <details className="advanced">
        <summary>Advanced: levels, prayers, boosts, spellbooks and ammo</summary>
        <div className="advanced-body">
          <div className="skills">
            {SKILLS.map(([k, label]) => (
              <label key={k}>
                <span>{label}</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={skills[k]}
                  onChange={(e) => set({ skills: { ...skills, [k]: Math.min(99, Math.max(1, Number(e.target.value) || 1)) } })}
                />
              </label>
            ))}
          </div>

          <fieldset>
            <legend>
              Unlocked prayers
              <InfoTip label="prayers">
                Every setup uses your best unlocked offensive prayer for its style. Without Piety, melee uses Ultimate Strength
                and Incredible Reflexes. Without Rigour or Augury, it&apos;s Deadeye or Eagle Eye, and Mystic Vigour or Mystic Might.
              </InfoTip>
            </legend>
            <div className="chips">
              {PRAYERS.map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={settings.unlocked[k]} onChange={(e) => set({ unlocked: { ...settings.unlocked, [k]: e.target.checked } })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>
              Boosts
              <InfoTip label="boosts">
                The potion used for each style. Every setup is calculated with this boost active. Smelling salts only work in
                Tombs of Amascut and Overload (+) only in Chambers of Xeric.
              </InfoTip>
            </legend>
            <div className="boosts">
              {(Object.keys(POTION_CHOICES) as Family[]).map((f) => {
                const current = POTION_CHOICES[f].findIndex(([, ps]) => ps.join() === settings.potions[f].join());
                return (
                  <label key={f}>
                    <span>{FAMILY_LABEL[f]}</span>
                    <select
                      value={Math.max(0, current)}
                      onChange={(e) => set({ potions: { ...settings.potions, [f]: POTION_CHOICES[f][Number(e.target.value)][1] } })}
                    >
                      {POTION_CHOICES[f].map(([label], i) => <option key={label} value={i}>{label}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>
              Spellbooks
              <InfoTip label="spellbooks">
                Spells from these spellbooks are tried on staves that can autocast, as long as your Magic level allows them.
                Powered staves like the Trident use their own spell.
              </InfoTip>
            </legend>
            <div className="chips">
              {SPELLBOOKS.map(([book, label]) => (
                <label key={book} className="check">
                  <input
                    type="checkbox"
                    checked={settings.spellbooks.includes(book)}
                    onChange={(e) => set({ spellbooks: e.target.checked ? [...settings.spellbooks, book] : settings.spellbooks.filter((b) => b !== book) })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={settings.anyAmmo} onChange={(e) => set({ anyAmmo: e.target.checked })} />
            Use any tradeable ammo
            <InfoTip label="ammo">
              On: ranged setups can use any tradeable arrows, bolts, darts and javelins, such as dragon arrows or ruby dragon
              bolts (e). Ammo is used up, so it&apos;s never suggested as an upgrade. Off: only ammo from your bank is used.
            </InfoTip>
          </label>
        </div>
      </details>
    </Step>
  );
};

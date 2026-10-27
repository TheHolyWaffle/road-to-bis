import { useMemo, useState } from 'react';
import { isRelevant, itemById } from '../engine/items';
import { FAMILIES, SLOTS, type Slot } from '../engine/types';
import { equipmentImage, plural } from '../lib/format';
import { InfoTip } from './info-tip';
import { Step } from './step';

interface Props {
  bankText: string;
  onBankText: (text: string) => void;
  bankRows: number;
  bankIds: number[];
  extraIds: number[];
  removedIds: number[];
  onRemovedIds: (ids: number[]) => void;
}

const SLOT_NAMES: Record<Slot, string> = {
  head: 'Head', cape: 'Cape', neck: 'Neck', ammo: 'Ammo', weapon: 'Weapons', body: 'Body',
  shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring',
};

const isCombatGear = (id: number) => {
  const item = itemById(id);
  return !!item && FAMILIES.some((f) => isRelevant(item, f));
};

export const BankStep = ({
  bankText, onBankText, bankRows, bankIds, extraIds, removedIds, onRemovedIds,
}: Props) => {
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const all = useMemo(() => [...new Set([...bankIds, ...extraIds])], [bankIds, extraIds]);
  const shown = showAll ? all : all.filter(isCombatGear);
  const removed = new Set(removedIds);
  const ownedCount = all.filter((id) => !removed.has(id)).length;

  const pasteFromClipboard = async () => {
    try {
      onBankText(await navigator.clipboard.readText());
      setClipboardError(null);
    } catch {
      setClipboardError('The browser blocked clipboard access. Paste into the box instead.');
    }
  };

  const toggle = (id: number) => onRemovedIds(removed.has(id) ? removedIds.filter((r) => r !== id) : [...removedIds, id]);

  return (
    <Step index={1} title="Your gear" summary={bankRows ? `${plural(ownedCount, 'item')} owned` : undefined}>
      <p className="hint">
        Paste the bank export from the
        {' '}
        <a href="https://runelite.net/plugin-hub/show/bank-memory" target="_blank" rel="noreferrer">Bank Memory plugin</a>
        . Bank your worn gear before exporting so it&apos;s included.
      </p>
      <div className="row">
        <button type="button" onClick={pasteFromClipboard}>Paste from clipboard</button>
        {bankText && <button type="button" className="quiet" onClick={() => onBankText('')}>Clear bank</button>}
      </div>
      {clipboardError && <p className="error">{clipboardError}</p>}
      <textarea
        aria-label="Bank export"
        placeholder={'Item id\tItem name\tItem quantity\n26219\tOsmumten\'s fang\t1'}
        value={bankText}
        onChange={(e) => onBankText(e.target.value)}
        rows={3}
        spellCheck={false}
      />
      {bankText && <p className="hint">{`Found ${plural(bankIds.length, 'equipment item')} in ${plural(bankRows, 'bank row')}.`}</p>}

      {all.length > 0 && (
        <details className="owned">
          <summary>{`Review owned items (${ownedCount})`}</summary>
          <div className="row spread">
            <p className="hint">
              Select an item to leave it out of your setups.
              <InfoTip label="leaving items out">
                Left-out items aren&apos;t used in any setup, for example gear you&apos;ve lent out or can&apos;t wear yet.
                Select it again to use it.
              </InfoTip>
            </p>
            <label className="check">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show non-combat items
            </label>
          </div>
          {SLOTS.map((slot) => {
            const ids = shown.filter((id) => itemById(id)?.slot === slot);
            if (!ids.length) return null;
            return (
              <div key={slot} className="owned-slot">
                <h3>{SLOT_NAMES[slot]}</h3>
                <div className="owned-grid">
                  {ids.map((id) => {
                    const item = itemById(id)!;
                    const off = removed.has(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        className={`owned-item${off ? ' is-off' : ''}`}
                        title={`${item.name}${off ? ' (left out)' : ''}`}
                        aria-pressed={!off}
                        onClick={() => toggle(id)}
                      >
                        <img src={equipmentImage(item.image)} alt={item.name} loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </details>
      )}
    </Step>
  );
};

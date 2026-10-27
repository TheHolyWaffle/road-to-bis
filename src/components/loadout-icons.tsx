import { SLOTS, type LoadoutRef } from '../engine/types';
import { ItemIcon } from './item-icon';

export const LoadoutIcons = ({ loadout, highlight = [] }: { loadout: LoadoutRef | null; highlight?: number[] }) => {
  if (!loadout) return <span className="hint">No usable weapon for this style.</span>;
  const how = loadout.spell ? `${loadout.spell}` : `${loadout.styleName}${loadout.styleStance && loadout.styleStance !== loadout.styleName ? ` (${loadout.styleStance})` : ''}`;
  return (
    <div className="loadout">
      <div className="loadout-items">
        {SLOTS.map((slot) => {
          const id = loadout.equipment[slot];
          if (id === undefined) return null;
          return (
            <span key={slot} className={highlight.includes(id) ? 'is-new' : undefined}>
              <ItemIcon id={id} size={26} />
            </span>
          );
        })}
      </div>
      <span className="loadout-style">{how}</span>
    </div>
  );
};

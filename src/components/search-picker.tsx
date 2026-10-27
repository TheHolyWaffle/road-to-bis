import { useId, useMemo, useState } from 'react';

export interface PickerOption {
  key: string;
  label: string;
  detail?: string;
  image?: string;
}

interface Props {
  options: PickerOption[];
  placeholder: string;
  label: string;
  onPick: (option: PickerOption) => void;
}

const MAX_SHOWN = 30;

export const SearchPicker = ({
  options, placeholder, label, onPick,
}: Props) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: PickerOption[] = [];
    const contains: PickerOption[] = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q)) starts.push(o);
      else if (l.includes(q) || o.detail?.toLowerCase().includes(q)) contains.push(o);
      if (starts.length >= MAX_SHOWN) break;
    }
    return [...starts, ...contains].slice(0, MAX_SHOWN);
  }, [options, query]);

  const pick = (o: PickerOption) => {
    onPick(o);
    setQuery('');
    setActive(0);
  };

  return (
    <div className="picker">
      <input
        type="search"
        aria-label={label}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {matches.length > 0 && (
        <ul className="picker-list" role="listbox" id={listId}>
          {matches.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >
              {o.image && <img src={o.image} alt="" loading="lazy" />}
              <span>{o.label}</span>
              {o.detail && <small>{o.detail}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

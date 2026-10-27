/** Formats gp like an in-game item stack, including its colour band. */
export const formatGp = (gp: number): { text: string; band: 'low' | 'k' | 'm' } => {
  if (gp >= 10_000_000) return { text: `${(gp / 1e6).toFixed(gp >= 1e9 ? 0 : 1).replace(/\.0$/, '')}M`, band: 'm' };
  if (gp >= 100_000) return { text: `${Math.round(gp / 1e3)}K`, band: 'k' };
  return { text: gp.toLocaleString('en-GB'), band: 'low' };
};

export const equipmentImage = (image: string) => `https://tools.runescape.wiki/osrs-dps/cdn/equipment/${encodeURIComponent(image)}`;
export const monsterImage = (image: string) => `https://tools.runescape.wiki/osrs-dps/cdn/monsters/${encodeURIComponent(image)}`;
const wikiTitle = (s: string) => encodeURIComponent(s.replaceAll(' ', '_'));
/** A wiki page, optionally at the anchor of one version's infobox tab (e.g. Vorkath#Post-quest). */
export const wikiLink = (name: string, version?: string) => `https://oldschool.runescape.wiki/w/${wikiTitle(name)}${version ? `#${encodeURI(version.replaceAll(' ', '_'))}` : ''}`;

export const plural = (count: number, word: string) => `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;

/** DPS to two decimals; kills per hour to one. */
export const formatScore = (value: number, objective: 'dps' | 'killsPerHour') => (
  objective === 'dps' ? value.toFixed(2) : value.toFixed(1)
);


export const formatPercent = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/** A kill time, e.g. "48.2s" or "2m 05s". */
export const formatSeconds = (s: number) => {
  if (!Number.isFinite(s)) return '–';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s - m * 60)).padStart(2, '0')}s`;
};

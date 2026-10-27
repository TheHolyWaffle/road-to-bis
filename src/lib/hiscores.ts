import ky, { isHTTPError } from 'ky';
import type { PlayerSkills } from '../engine/dps-calc';

// The OSRS hiscores have no CORS headers, so levels come from Wise Old Man, which mirrors them.
const WOM = 'https://api.wiseoldman.net/v2/players';

interface WomPlayer {
  latestSnapshot: { data: { skills: Record<string, { level: number }> } } | null;
}

const fromWom = (player: WomPlayer): PlayerSkills => {
  const skills = player.latestSnapshot?.data.skills;
  if (!skills) throw new Error('Wise Old Man has no levels for this player yet. Enter your levels by hand instead.');
  const level = (s: string) => skills[s]?.level ?? 1;
  return {
    atk: level('attack'), def: level('defence'), str: level('strength'), hp: level('hitpoints'), ranged: level('ranged'),
    prayer: level('prayer'), magic: level('magic'), mining: level('mining'), herblore: level('herblore'), farming: level('farming'),
  };
};

export const fetchSkills = async (rsn: string): Promise<PlayerSkills> => {
  const url = `${WOM}/${encodeURIComponent(rsn.trim())}`;
  // Updating pulls fresh levels from the hiscores; it's rate limited, so a player updated moments ago falls back to the
  // levels Wise Old Man already has.
  const updated = await ky.post(url).json<WomPlayer>().catch(() => null);
  if (updated) return fromWom(updated);
  const player = await ky.get(url).json<WomPlayer>().catch((e) => {
    if (isHTTPError(e) && e.response.status === 404) throw new Error(`No hiscores entry for "${rsn}".`);
    const status = isHTTPError(e) ? ` (HTTP ${e.response.status})` : '';
    throw new Error(`Levels lookup failed${status}. Enter your levels by hand instead.`);
  });
  return fromWom(player);
};

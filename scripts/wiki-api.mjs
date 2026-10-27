// Shared access to the OSRS Wiki API for the fetch-* scripts.
import ky from 'ky';

export const API = 'https://oldschool.runescape.wiki/api.php';
export const HEADERS = { 'User-Agent': 'road-to-bis (OSRS gear upgrade planner)' };
const PAGE = 5000;

/** Every row of a wiki bucket, e.g. fetchBucket('recipe', ['production_json']). */
export const fetchBucket = async (bucket, fields) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const query = `bucket('${bucket}').select(${fields.map((f) => `'${f}'`).join(',')}).limit(${PAGE}).offset(${offset}).run()`;
    const { bucket: page } = await ky.get(API, { searchParams: { action: 'bucket', format: 'json', query }, headers: HEADERS }).json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
};

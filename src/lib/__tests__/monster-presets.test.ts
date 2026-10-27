import { describe, expect, it } from 'vitest';
import {
  FIGHTS, findMonsterKey, PRESETS, RAIDS,
} from '../monster-presets';

describe('monster presets', () => {
  it.each([
    ...PRESETS, ...RAIDS.map((r) => [r.name, r.monsters] as const), ...FIGHTS.map((f) => [f.name, f.phases.map((p) => p.ref)] as const),
  ])('%s only names monsters that exist', (_, refs) => {
    expect(refs.filter((ref) => findMonsterKey(ref) === null)).toEqual([]);
  });
});

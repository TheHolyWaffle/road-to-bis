import { describe, expect, it } from 'vitest';
import { allMonsters, buildMonster, monsterKey } from '../build-player';
import { incomingStyles, tripStats } from '../survival';
import { maxedSettings } from './fixtures';

const monster = (name: string, version = '') => buildMonster(monsterKey(allMonsters.find((m) => m.name === name && m.version === version)!));

describe('survival', () => {
  it('reads incoming attack styles from the wiki data, skipping non-combat ones', () => {
    expect(incomingStyles(monster('Vorkath', 'Post-quest'))).toEqual(['slash', 'magic', 'ranged']);
    expect(incomingStyles(monster('Vardorvis', 'Post-quest'))).toEqual(['slash']);
  });

  it('turns DPS and damage taken into kills per trip and per hour', () => {
    const vorkath = monster('Vorkath', 'Post-quest');
    const settings = { ...maxedSettings, foodPerTrip: 401, bankingSeconds: 100 };
    // 750 HP at 10 DPS is 75s per kill; taking 4 DPS is 300 damage per kill, so 500 HP lasts 5/3 kills.
    const stats = tripStats(10, 4, vorkath.skills.hp, settings);
    expect(stats.damagePerKill).toBeCloseTo(300);
    expect(stats.killsPerTrip).toBeCloseTo(500 / 300);
    expect(stats.killsPerHour).toBeCloseTo(3600 / (75 + 100 / (500 / 300)));
  });

  it('never banks when nothing hurts you', () => {
    const stats = tripStats(10, 0, monster('Vorkath', 'Post-quest').skills.hp, maxedSettings);
    expect(stats.killsPerTrip).toBe(Infinity);
    expect(stats.killsPerHour).toBeCloseTo(3600 / 75);
  });
});

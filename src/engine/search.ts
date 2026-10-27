import type { Task, TaskResult } from './task-runner';
import {
  type Family, type Frontier, gearIds, type MonsterSpec,
} from './types';

interface SearchInput {
  monsters: MonsterSpec[];
  ownedIds: number[];
}

export type Phase = 'curves' | 'cross';

export interface Progress {
  phase: Phase;
  done: number;
  total: number;
  calcs: number;
}

export interface SearchOutput {
  /** monster key -> style -> cost curve */
  frontiers: Record<string, Partial<Record<Family, Frontier>>>;
  calcs: number;
}

/**
 * Traces every monster and style's cost curve, then checks each curve's item sets at every other monster, so an item
 * bought for one monster is valued wherever it helps. `onUpdate` fires after every finished task.
 */
export const runSearch = async (
  input: SearchInput,
  exec: (task: Task) => Promise<TaskResult>,
  onUpdate: (p: Progress) => void,
): Promise<SearchOutput> => {
  const out: SearchOutput = { frontiers: {}, calcs: 0 };
  const pairs = input.monsters.flatMap((m) => m.families.map((family) => ({ monster: m.key, family })));

  const runPhase = async (phase: Phase, tasks: Task[]) => {
    let done = 0;
    const report = () => onUpdate({
      phase, done, total: tasks.length, calcs: out.calcs,
    });
    report();
    await Promise.all(tasks.map(async (t) => {
      const r = await exec(t);
      const perMonster = (out.frontiers[t.monster] ??= {});
      if (r.kind === 'frontier') perMonster[t.family] = r.result;
      else perMonster[t.family] = { ...perMonster[t.family]!, alternatives: [...perMonster[t.family]!.alternatives ?? [], ...r.result] };
      out.calcs += r.calcs;
      done++;
      report();
    }));
  };

  await runPhase('curves', pairs.map((p) => ({ kind: 'frontier', ...p })));

  const owned = new Set(input.ownedIds);
  const setsByFamily = new Map<Family, Map<string, number[]>>();
  for (const { monster, family } of pairs) {
    const f = out.frontiers[monster]?.[family];
    for (const p of [...f?.points ?? [], ...f?.alternatives ?? []]) {
      const ids = gearIds(p.loadout).filter((id) => !owned.has(id));
      if (!setsByFamily.has(family)) setsByFamily.set(family, new Map());
      setsByFamily.get(family)!.set(ids.sort((a, b) => a - b).join(','), ids);
    }
  }
  await runPhase('cross', pairs.map((p) => ({
    kind: 'cross',
    ...p,
    baseline: out.frontiers[p.monster]?.[p.family]?.baseline.loadout ?? null,
    itemSets: [...(setsByFamily.get(p.family)?.values() ?? [])],
  })));
  return out;
};

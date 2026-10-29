import { isDefined } from './dps-calc';
import { phaseSeconds, phaseTiming, SLOWEST } from './path';
import type {
  CrossTask, FrontierTask, JointMember, JointTask, Task, TaskResult,
} from './task-runner';
import {
  type Family, FAMILIES, fightsOf, type Frontier, gearIds, type MonsterSpec,
} from './types';

interface SearchInput {
  monsters: MonsterSpec[];
  ownedIds: number[];
}

export type Phase = 'curves' | 'joint' | 'cross';

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
 * What a DPS more at each monster adds to the path's weighted average speed-up, at the gear you own: a fight's share of
 * the weight, times its phase's share of the kill time, over the DPS you have there now.
 */
const dpsWeights = (monsters: MonsterSpec[], frontiers: SearchOutput['frontiers']) => {
  const fights = fightsOf(monsters);
  const totalWeight = fights.reduce((sum, f) => sum + monsters[f.phases[0]].weight, 0) || 1;
  const weights = new Map<string, number>();
  for (const fight of fights) {
    const share = monsters[fight.phases[0]].weight / totalWeight;
    const phases = fight.phases.map((i) => {
      const m = monsters[i];
      const curves = Object.values(frontiers[m.key] ?? {}).filter(isDefined);
      const timing = phaseTiming(m, curves.flatMap((f) => [f.baseline, ...f.points].map((p) => p.dps)));
      const now = Math.max(timing.top / SLOWEST, ...curves.map((f) => f.baseline.dps));
      return { key: m.key, now, seconds: phaseSeconds(timing, now) };
    });
    const seconds = phases.reduce((sum, p) => sum + p.seconds, 0);
    for (const p of phases) {
      if (p.seconds > 0) weights.set(p.key, (share * (p.seconds / seconds)) / p.now);
    }
  }
  return weights;
};

/**
 * Traces every monster and style's cost curve, then looks for the items that help most across all the monsters at
 * once, then checks each item set found at every monster, so an item bought for one monster is valued wherever it
 * helps. `onUpdate` fires after every finished task.
 */
export const runSearch = async (
  input: SearchInput,
  exec: (task: Task) => Promise<TaskResult>,
  onUpdate: (p: Progress) => void,
): Promise<SearchOutput> => {
  const out: SearchOutput = { frontiers: {}, calcs: 0 };
  const pairs = input.monsters.flatMap((m) => m.families.map((family) => ({ monster: m.key, family })));

  const runPhase = async <T extends Task>(
    phase: Phase,
    tasks: T[],
    onResult: (t: T, r: Extract<TaskResult, { kind: T['kind'] }>) => void,
  ) => {
    let done = 0;
    const report = () => onUpdate({
      phase, done, total: tasks.length, calcs: out.calcs,
    });
    report();
    await Promise.all(tasks.map(async (t) => {
      const r = await exec(t);
      onResult(t, r as Extract<TaskResult, { kind: T['kind'] }>);
      out.calcs += r.calcs;
      done++;
      report();
    }));
  };

  await runPhase('curves', pairs.map((p): FrontierTask => ({ kind: 'frontier', ...p })), (t, r) => {
    (out.frontiers[t.monster] ??= {})[t.family] = r.result;
  });

  const owned = new Set(input.ownedIds);
  const setsByFamily = new Map<Family, Map<string, number[]>>(FAMILIES.map((f) => [f, new Map()]));
  const addSet = (family: Family, ids: number[]) => {
    const sorted = ids.filter((id) => !owned.has(id)).sort((a, b) => a - b);
    if (sorted.length) setsByFamily.get(family)!.set(sorted.join(','), sorted);
  };
  for (const { monster, family } of pairs) {
    const f = out.frontiers[monster]?.[family];
    for (const p of [...f?.points ?? [], ...f?.alternatives ?? []]) addSet(family, gearIds(p.loadout));
  }

  const weights = dpsWeights(input.monsters, out.frontiers);
  const joints = FAMILIES.map((family): JointTask => {
    let scale = 0;
    const members = pairs.filter((p) => p.family === family).flatMap((p): JointMember[] => {
      const f = out.frontiers[p.monster]?.[family];
      const weight = weights.get(p.monster);
      if (!f || !weight) return [];
      scale += weight * (f.points.at(-1)?.dps ?? 0);
      return [{ monster: p.monster, baseline: f.baseline.loadout, weight }];
    });
    return {
      kind: 'joint', family, members, bundles: [...setsByFamily.get(family)!.values()], scale,
    };
  }).filter((t) => t.members.length > 1 && t.scale > 0);
  await runPhase('joint', joints, (t, r) => r.result.forEach((ids) => addSet(t.family, ids)));

  await runPhase('cross', pairs.map((p): CrossTask => ({
    kind: 'cross',
    ...p,
    baseline: out.frontiers[p.monster]?.[p.family]?.baseline.loadout ?? null,
    itemSets: [...setsByFamily.get(p.family)!.values()],
  })), (t, r) => {
    const f = out.frontiers[t.monster]![t.family]!;
    f.alternatives = [...f.alternatives ?? [], ...r.result];
  });
  return out;
};

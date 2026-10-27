import { allMonsters, monsterByKey, monsterKey } from '../engine/build-player';
import type { MonsterScaling } from '../engine/types';

export type MonsterRef = [name: string, version?: string];

export interface Raid {
  name: string;
  scaling: MonsterScaling;
  scalingField: keyof MonsterScaling;
  scalingLabel: string;
  scalingMin: number;
  scalingMax: number;
  scalingStep: number;
  scalingHelp: string;
  monsters: MonsterRef[];
}

export const RAIDS: Raid[] = [
  {
    name: 'Chambers of Xeric',
    scaling: { partySize: 1 },
    scalingField: 'partySize',
    scalingLabel: 'Party size',
    scalingMin: 1,
    scalingMax: 100,
    scalingStep: 1,
    scalingHelp: 'Chambers of Xeric bosses get more defence and HP with a bigger party. Changing it on one boss changes every Chambers of Xeric boss.',
    monsters: [
      ['Tekton', 'Normal'], ['Vasa Nistirio', 'Normal'], ['Vespula', 'Normal'], ['Muttadile', 'Large'],
      ['Vanguard', 'Melee'], ['Vanguard', 'Ranged'], ['Vanguard', 'Magic'], ['Ice demon', 'Normal'],
      ['Skeletal Mystic', 'Normal'], ['Guardian (Chambers of Xeric)', 'Normal'], ['Lizardman shaman (Chambers of Xeric)', 'Normal'],
      ['Deathly ranger', 'Normal'], ['Deathly mage', 'Normal'],
      ['Great Olm', 'Head (Normal)'], ['Great Olm', 'Left claw (Normal)'], ['Great Olm', 'Right claw (Normal)'],
    ],
  },
  {
    name: 'Theatre of Blood',
    scaling: { partySize: 4 },
    scalingField: 'partySize',
    scalingLabel: 'Party size',
    scalingMin: 1,
    scalingMax: 5,
    scalingStep: 1,
    scalingHelp: 'Theatre of Blood bosses get more defence and HP with a bigger party. Changing it on one boss changes every Theatre of Blood boss.',
    monsters: [
      ['The Maiden of Sugadinti', 'Normal'], ['Pestilent Bloat', 'Normal'], ['Nylocas Vasilias', 'Normal'],
      ['Sotetseg', 'Normal'], ['Xarpus', 'Normal mode'], ['Verzik Vitur', 'Normal mode, Phase 2'], ['Verzik Vitur', 'Normal mode, Phase 3'],
    ],
  },
  {
    name: 'Tombs of Amascut',
    scaling: { toaInvocationLevel: 300 },
    scalingField: 'toaInvocationLevel',
    scalingLabel: 'Raid level',
    scalingMin: 0,
    scalingMax: 600,
    scalingStep: 5,
    scalingHelp: 'The Tombs of Amascut raid level from your invocations. Higher levels give the bosses more defence and HP. Changing it on one boss changes every boss in the raid.',
    monsters: [
      ['Akkha'], ['Ba-Ba'], ['Kephri', 'Shielded'], ['Zebak', 'Normal'],
      ['Obelisk (Tombs of Amascut)'], ["Elidinis' Warden", 'Active'], ["Tumeken's Warden", 'Damaged'],
    ],
  },
];

export const findMonsterKey = ([name, version]: MonsterRef) => {
  const m = allMonsters.find((x) => x.name === name && (version === undefined || x.version === version));
  return m ? monsterKey(m) : null;
};

export const raidByKey = new Map(RAIDS.flatMap((raid) => raid.monsters.flatMap((ref) => {
  const key = findMonsterKey(ref);
  return key ? [[key, raid] as const] : [];
})));

const TASK_ONLY = new Set(['Alchemical Hydra', 'Cerberus', 'Kraken', 'Thermonuclear smoke devil', 'Abyssal Sire', 'Dusk', 'Dawn']);

/** Whether a monster can only be fought on a slayer task. */
export const taskOnly = (key: string) => TASK_ONLY.has(monsterByKey.get(key)?.name ?? '');

/** A boss fought in phases, each listed as its own monster. `hp` is what you take off it in that phase. */
export interface Fight {
  name: string;
  phases: { ref: MonsterRef; hp?: number }[];
}

export const FIGHTS: Fight[] = [
  // Zulrah's 500 HP is shared between its forms; how it splits depends on the rotation, so it's an even split here.
  { name: 'Zulrah', phases: [{ ref: ['Zulrah', 'Serpentine'], hp: 167 }, { ref: ['Zulrah', 'Magma'], hp: 167 }, { ref: ['Zulrah', 'Tanzanite'], hp: 166 }] },
  {
    name: 'Alchemical Hydra',
    phases: [
      { ref: ['Alchemical Hydra', 'Serpentine'], hp: 275 }, { ref: ['Alchemical Hydra', 'Electric'], hp: 275 },
      { ref: ['Alchemical Hydra', 'Fire'], hp: 275 }, { ref: ['Alchemical Hydra', 'Extinguished'], hp: 275 },
    ],
  },
  { name: 'Kalphite Queen', phases: [{ ref: ['Kalphite Queen', 'Crawling'] }, { ref: ['Kalphite Queen', 'Airborne'] }] },
];

export const PRESETS: [string, MonsterRef[]][] = [
  ['God Wars', [['General Graardor'], ["K'ril Tsutsaroth"], ['Commander Zilyana'], ["Kree'arra"], ['Nex']]],
  ['Desert Treasure II', [['Duke Sucellus', 'Post-quest, Awake'], ['Vardorvis', 'Post-quest'], ['The Leviathan', 'Post-quest'], ['The Whisperer', 'Post-quest']]],
  ['Slayer bosses', [['Alchemical Hydra', 'Electric'], ['Cerberus'], ['Kraken', 'Kraken'], ['Thermonuclear smoke devil'], ['Araxxor'], ['Abyssal Sire', 'Phase 1']]],
  ['Popular bosses', [['Vorkath', 'Post-quest'], ['Zulrah', 'Serpentine'], ['Phantom Muspah', 'Ranged'], ['Tormented Demon', '1'], ['Yama', 'Normal'], ['Corporeal Beast']]],
];

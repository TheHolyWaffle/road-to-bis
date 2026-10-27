import { monsterByKey, monsterLabel } from '../engine/build-player';
import { wikiLink } from '../lib/format';

export const MonsterLink = ({ monsterKey: key }: { monsterKey: string }) => {
  const m = monsterByKey.get(key);
  if (!m) return <>{key}</>;
  return <a href={wikiLink(m.name, m.version)} target="_blank" rel="noreferrer">{monsterLabel(key)}</a>;
};

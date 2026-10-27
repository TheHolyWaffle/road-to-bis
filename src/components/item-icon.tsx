import { itemById } from '../engine/items';
import { equipmentImage, wikiLink } from '../lib/format';

export const ItemIcon = ({ id, size = 28, tabIndex }: { id: number; size?: number; tabIndex?: number }) => {
  const item = itemById(id);
  if (!item) return null;
  return (
    <a className="item-icon" href={wikiLink(item.name)} target="_blank" rel="noreferrer" title={item.name} tabIndex={tabIndex}>
      <img src={equipmentImage(item.image)} alt={item.name} width={size} height={size} loading="lazy" />
    </a>
  );
};

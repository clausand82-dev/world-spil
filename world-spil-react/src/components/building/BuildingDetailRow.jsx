/* Memoized row used by Addons/Research/Recipes on BuildingDetailPage — uses Icon and lazy GameImage */
import React, { useMemo } from 'react';
import Icon from '../ui/Icon.jsx';
import GameImage from '../GameImage.jsx';
import ActionButton from '../ActionButton.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import { useRequirements } from '../requirements/Requirements.jsx';

function SmallMeta({ def }) {
  if (!def) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{def.desc}</div>
    </div>
  );
}

function RowInner({ item, defs, parentDef }) {
  const { data } = useGameData();
  const def = item?.def || defs?.[item?.key] || item;
  const { allOk, Component: ReqLine } = useRequirements(item);

  const imgKey = def?.art || def?.key || (item?.key || '').split('.').pop();
  const art = useMemo(() => (
    <GameImage src={`/assets/art/${imgKey}.png`} fallback="/assets/art/placeholder.small.png" width={48} height={48} loading="lazy" />
  ), [imgKey]);

  return (
    <div className="item" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 48, height: 48 }}>{art}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon def={def} size={20} alt={def?.name} />
          <div style={{ fontWeight: 600 }}>{def?.name}</div>
        </div>
        <SmallMeta def={def} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <ReqLine showLabels={false} inline={true} />
        <ActionButton item={item} allOk={allOk} />
      </div>
    </div>
  );
}

export default React.memo(RowInner, (prev, next) => {
  if (prev.item?.id === next.item?.id && prev.defs === next.defs && prev.parentDef === next.parentDef) return true;
  return false;
});
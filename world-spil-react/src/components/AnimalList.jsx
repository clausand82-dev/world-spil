import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ItemRow from './ItemRow.jsx';
import { fmt } from '../services/helpers.js';
import Icon from './ui/Icon.jsx'; // brug central Icon-komponent til alle ikoner

/**
 * Viser ejede "ani."-items. Kan filtrere på family:
 * - family="farm"  => klassiske dyr (animal_cap)
 * - family="health"=> health units (healthUnitUsage)
 */
export default function AnimalList({ format = 'simple', family = null }) {
  const { data } = useGameData();
  if (!data) return null;

  const owned = Object.entries(data.state.ani || {})
    .filter(([_, a]) => (a?.quantity || 0) > 0)
    .sort();

  const filtered = owned.filter(([id]) => {
    const key = id.replace(/^ani\./, '');
    const def = data.defs.ani?.[key];
    if (!def) return false;
    if (!family) return true;
    const fam = String(def.family || '').split(',').map(s => s.trim()).filter(Boolean);
    return fam.includes(family);
  });

  if (filtered.length === 0) {
    return <div className="sub">Ingen</div>;
  }

  return filtered.map(([id, animalData]) => {
    const key = id.replace(/^ani\./, '');
    const def = data.defs.ani?.[key];
    if (!def) return null;

    const qty = Number(animalData.quantity || 0);
    const animalCapPer = Math.abs(Number(def.stats?.animal_cap ?? 0));
    const healthUsePer = Math.abs(Number(def.stats?.healthUnitUsage ?? 0));

    if (format === 'simple') {
      return (
        <div className="row" key={id}>
          <div className="left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {def.iconUrl ? <Icon src={def.iconUrl} size={20} alt={def.name} /> : <Icon def={{ emoji: def.emoji }} size={20} alt={def.name} />}
            </span>
            <span>{def.name}</span>
          </div>
          <div className="right"><strong>{fmt(qty)}</strong></div>
        </div>
      );
    }

    if (format === 'detailed') {
      const isHealthUnit = healthUsePer > 0;
      const subtitle = isHealthUnit
        ? `Forbruger ${healthUsePer} health-unit pr. stk`
        : `Optager ${animalCapPer} staldplads pr. stk`;
      const total = isHealthUnit
        ? `${fmt(qty)} stk / Forbrug ${fmt(healthUsePer * qty)} health-units i alt`
        : `${fmt(qty)} stk / Fylder ${fmt(animalCapPer * qty)} staldpladser i alt`;

      return (
        <ItemRow
          key={id}
          icon={def.iconUrl ? <Icon src={def.iconUrl} size={20} alt={def.name} /> : <Icon def={{ emoji: def.emoji }} size={20} alt={def.name} />}
          title={def.name}
          subtitle={subtitle}
          value={total}
        />
      );
    }

    return null;
  });
}
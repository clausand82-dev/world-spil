import { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

// Sikker konverteringer
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function first(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * Afgør om brugeren allerede har valgt et felt:
 * - hasClaim = true, hvis (x>0 && y>0) eller field>0
 * - Returnerer også x, y og field (udledt i begge retninger)
 *
 * Understøtter flere mulige placeringer i state:
 *  - data.state.user.{x_coord,y_coord,field_id}
 *  - data.user.{...}
 *  - data.profile.{...}
 *  - data.{x_coord,y_coord,field_id}
 */
export function useUserBaseClaim() {
  const ctx = useGameData() || {};
  const data = ctx?.data || ctx?.gameState?.data || null;
  const S = (data && (data.state || data)) || {};

  // Prøv flere nøgler
  const rawField = first(
    S?.user?.field_id,
    S?.profile?.field_id,
    S?.field_id,
    S?.map?.field_id
  );
  const rawX = first(
    S?.user?.x_coord,
    S?.profile?.x_coord,
    S?.x_coord,
    S?.map?.x_coord,
    S?.user?.x,        // fallback hvis gemt uden "_coord"
    S?.profile?.x,
    S?.x
  );
  const rawY = first(
    S?.user?.y_coord,
    S?.profile?.y_coord,
    S?.y_coord,
    S?.map?.y_coord,
    S?.user?.y,
    S?.profile?.y,
    S?.y
  );

  return useMemo(() => {
    let field = toInt(rawField);
    let x = toInt(rawX);
    let y = toInt(rawY);

    // Udled den manglende dimension
    if ((!x || !y) && field > 0) {
      x = ((field - 1) % 50) + 1;
      y = Math.floor((field - 1) / 50) + 1;
    } else if (field <= 0 && x > 0 && y > 0) {
      field = (y - 1) * 50 + x;
    }

    const hasClaim = (x > 0 && y > 0) || (field > 0);
    return { hasClaim, x, y, field };
  }, [rawField, rawX, rawY]);
}
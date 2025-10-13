export async function fetchOverrides(family) {
  const params = family ? `?family=${encodeURIComponent(family)}` : '';
  const res = await fetch(`/api/management/choices.php${params}`, { credentials: 'include' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Failed to load overrides');
  return json.overrides || {};
}

export async function saveOverrides(family, overrides, { replaceFamily = true } = {}) {
  const res = await fetch(`world-spil/backend/api/management/choices.php`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ family, overrides, replaceFamily }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Failed to save overrides');
  return true;
}
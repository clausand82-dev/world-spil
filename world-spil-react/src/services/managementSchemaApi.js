export async function fetchSchema(family) {
  const res = await fetch(`world-spil/backend/api/management/schema.php?family=${encodeURIComponent(family)}`, {
    credentials: 'include'
  });
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  if (!res.ok) {
    const txt = isJson ? JSON.stringify(await res.json()) : await res.text();
    throw new Error(`Schema HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  if (!isJson) {
    const txt = await res.text();
    throw new Error(`Schema: Expected JSON, got: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Failed to load schema');
  return json.schema;
}
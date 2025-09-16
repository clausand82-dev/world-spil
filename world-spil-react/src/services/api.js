// src/services/api.js
/*export async function postJSON(url, body) {
    try {
        const relativeUrl = url.startsWith('http') ? new URL(url).pathname : url;
        const res = await fetch(relativeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const responseData = await res.json();
        if (!res.ok || !responseData.ok) {
            throw new Error(responseData.message || 'Server returned an error.');
        }
        return responseData;
    } catch (err) {
        console.error("API call failed:", err);
        throw err;
    }
}*/
// services/api.js
export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  // Læs serverens svar (også ved fejl) for at få en ordentlig fejlbesked
  let payload = null;
  const text = await res.text().catch(() => null);
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!res.ok) {
    const msg =
      (payload && payload.message) ||
      (typeof payload === 'string' && payload) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.response = payload;
    throw err;
  }
  return payload;
}
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameData } from '../context/GameDataContext.jsx';

export function useMutate() {
  const queryClient = useQueryClient();
  const { applyResourceDeltaMap } = useGameData() || {};

  const mutation = useMutation({
    mutationFn: async ({ url, payload }) => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || (json && json.ok === false)) {
        const msg = json?.error?.message || `Fejl (${resp.status})`;
        throw new Error(msg);
      }
      return json || { ok: true };
    },
    onSuccess: (json) => {
      if (json?.delta?.resources && applyResourceDeltaMap) {
        try { applyResourceDeltaMap(json.delta.resources); } catch {}
      }
      // Sørg for frisk data (invalidér så næste læs henter nyt)
      queryClient.invalidateQueries({ queryKey: ['alldata'] }).catch(() => {});
    },
  });

  // nemt API
  return async (url, payload) => mutation.mutateAsync({ url, payload });
}
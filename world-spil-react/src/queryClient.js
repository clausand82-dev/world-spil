import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Frisk UI når brugeren vender tilbage
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      // Hold på cache lidt tid, men betragt data som stale (så refetch henter nyt)
      staleTime: 0,
      gcTime: 10 * 60 * 1000,
    },
  },
});
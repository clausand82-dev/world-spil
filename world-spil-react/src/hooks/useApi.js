import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/apiClient';

export function useFetch(key, url, options = {}) {
  return useQuery([key, url], async () => {
    const res = await api.get(url);
    return res.data;
  }, {
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

export function useMutationApi(url, method = 'post', options = {}) {
  const qc = useQueryClient();
  return useMutation(async (payload) => {
    const res = await api[method](url, payload);
    return res.data;
  }, {
    onSuccess: (...args) => {
      qc.invalidateQueries();
      if (options.onSuccess) options.onSuccess(...args);
    },
    ...options,
  });
}
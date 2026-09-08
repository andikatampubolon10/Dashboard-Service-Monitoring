import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';
import { RegisterServerPayload } from '../types';

export function useServers() {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['servers', filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServers(filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
    staleTime: 5000,
  });
}

export function useServerDetail(serverId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['server-detail', serverId, filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServerById(serverId),
    enabled: Boolean(serverId),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
  });
}

export function useRegisterServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RegisterServerPayload) => monitoringApi.registerServer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });
}


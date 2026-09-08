import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceEndpoints(serviceId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-endpoints', serviceId, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceEndpoints(serviceId),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : 10000,
  });
}

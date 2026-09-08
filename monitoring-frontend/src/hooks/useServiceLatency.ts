import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceLatency(serviceId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-latency', serviceId, filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceLatency(serviceId, filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
  });
}

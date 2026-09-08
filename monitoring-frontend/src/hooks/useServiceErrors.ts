import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceErrors(serviceId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-errors', serviceId, filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceErrors(serviceId, filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
  });
}

export function useErrorDetail(errorId: string | null) {
  return useQuery({
    queryKey: ['error-detail', errorId],
    queryFn: () => (errorId ? monitoringApi.getErrorById(errorId) : null),
    enabled: Boolean(errorId),
  });
}

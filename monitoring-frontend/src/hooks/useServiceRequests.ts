import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceRequests(serviceId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-requests', serviceId, filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceRequests(serviceId, filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
  });
}

export function useRequestDetail(requestId: string | null) {
  return useQuery({
    queryKey: ['request-detail', requestId],
    queryFn: () => (requestId ? monitoringApi.getRequestById(requestId) : null),
    enabled: Boolean(requestId),
  });
}

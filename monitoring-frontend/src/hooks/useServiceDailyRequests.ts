import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceDailyRequests(
  serviceId: string,
  granularity?: 'hourly' | 'daily' | '30d'
) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-daily-requests', serviceId, filter, granularity, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceDailyRequests(serviceId, filter, granularity),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
    staleTime: 5000,
  });
}

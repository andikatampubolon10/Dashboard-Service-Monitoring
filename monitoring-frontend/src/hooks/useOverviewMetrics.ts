import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useOverviewMetrics() {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['overview-metrics', filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getOverviewMetrics(filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
    staleTime: 5000,
  });
}

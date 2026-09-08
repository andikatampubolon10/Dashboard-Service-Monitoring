import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServiceCharts(serviceId: string, rangeSec: number = 3600, points: number = 60) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-charts', serviceId, rangeSec, points, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceCharts(serviceId, rangeSec, points),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : 5000,
  });
}

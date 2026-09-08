import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';
import { useGlobalFilters } from '../context/FilterContext';

export function useServices() {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['services', filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServices(filter),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
    staleTime: 5000,
  });
}

export function useServiceDetail(serviceId: string) {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['service-detail', serviceId, filter, lastRefreshedAt],
    queryFn: () => monitoringApi.getServiceById(serviceId),
    enabled: Boolean(serviceId),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : false,
  });
}

export function useBackendHealth() {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['backend-health', lastRefreshedAt],
    queryFn: () => monitoringApi.getHealthStatus(),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : 5000,
    staleTime: 3000,
  });
}

export function useMetricsSummary() {
  const { filter, lastRefreshedAt } = useGlobalFilters();

  return useQuery({
    queryKey: ['metrics-summary', lastRefreshedAt],
    queryFn: () => monitoringApi.getMetricsSummary(),
    refetchInterval: filter.refreshInterval > 0 ? filter.refreshInterval * 1000 : 5000,
    staleTime: 3000,
  });
}


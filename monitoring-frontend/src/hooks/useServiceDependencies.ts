import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';

export function useServiceDependencies(serviceId: string) {
  return useQuery({
    queryKey: ['service-dependencies', serviceId],
    queryFn: () => monitoringApi.getServiceDependencies(serviceId),
  });
}

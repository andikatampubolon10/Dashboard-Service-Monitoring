import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoringApi';

export function useServiceAlerts(serviceId: string) {
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: ['service-alerts', serviceId],
    queryFn: () => monitoringApi.getServiceAlerts(serviceId),
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => monitoringApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['overview-metrics'] });
    },
  });

  const silenceMutation = useMutation({
    mutationFn: ({ alertId, duration }: { alertId: string; duration: number }) =>
      monitoringApi.silenceAlert(alertId, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['overview-metrics'] });
    },
  });

  return {
    ...alertsQuery,
    acknowledgeAlert: ackMutation.mutate,
    silenceAlert: silenceMutation.mutate,
    isMutating: ackMutation.isPending || silenceMutation.isPending,
  };
}

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { GlobalFilterState, Environment, TimeRangePreset } from '../types';

interface FilterContextType {
  filter: GlobalFilterState;
  setEnvironment: (env: Environment) => void;
  setServerId: (id: string) => void;
  setServiceId: (id: string) => void;
  setTimeRange: (range: TimeRangePreset) => void;
  setCustomDateRange: (from: string, to: string) => void;
  setRefreshInterval: (seconds: number) => void;
  lastRefreshedAt: Date;
  triggerManualRefresh: () => void;
}

const DEFAULT_FILTER: GlobalFilterState = {
  environment: 'production',
  serverId: 'all',
  serviceId: 'all',
  timeRange: '1h',
  refreshInterval: 10, // 10s default
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filter, setFilter] = useState<GlobalFilterState>(() => {
    // Load from localStorage if available
    try {
      const saved = localStorage.getItem('observe_global_filters');
      if (saved) {
        return { ...DEFAULT_FILTER, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_FILTER;
  });

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('observe_global_filters', JSON.stringify(filter));
    } catch {
      // ignore
    }
  }, [filter]);

  const setEnvironment = (environment: Environment) => {
    setFilter((prev) => ({ ...prev, environment }));
  };

  const setServerId = (serverId: string) => {
    setFilter((prev) => ({ ...prev, serverId }));
  };

  const setServiceId = (serviceId: string) => {
    setFilter((prev) => ({ ...prev, serviceId }));
  };

  const setTimeRange = (timeRange: TimeRangePreset) => {
    setFilter((prev) => ({ ...prev, timeRange, from: undefined, to: undefined }));
  };

  const setCustomDateRange = (from: string, to: string) => {
    setFilter((prev) => ({ ...prev, timeRange: 'custom', from, to }));
  };

  const setRefreshInterval = (refreshInterval: number) => {
    setFilter((prev) => ({ ...prev, refreshInterval }));
  };

  const triggerManualRefresh = () => {
    setLastRefreshedAt(new Date());
  };

  const value = useMemo(
    () => ({
      filter,
      setEnvironment,
      setServerId,
      setServiceId,
      setTimeRange,
      setCustomDateRange,
      setRefreshInterval,
      lastRefreshedAt,
      triggerManualRefresh,
    }),
    [filter, lastRefreshedAt]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
};

export function useGlobalFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useGlobalFilters must be used within a FilterProvider');
  }
  return context;
}

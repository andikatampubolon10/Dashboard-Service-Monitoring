import React from 'react';
import { HealthStatus } from '../../types';
import { getHealthStatusClasses } from '../../utils/statusColors';

interface StatusBadgeProps {
  status: HealthStatus;
  label?: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'sm',
  showDot = true,
}) => {
  const { bg, text, border, dot, pulse } = getHealthStatusClasses(status);
  const displayLabel = label || status.toUpperCase();

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md border ${bg} ${text} ${border} ${sizeClasses}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dot} ${
            pulse ? 'animate-pulse' : ''
          }`}
        />
      )}
      {displayLabel}
    </span>
  );
};

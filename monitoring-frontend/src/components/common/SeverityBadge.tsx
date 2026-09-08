import React from 'react';
import { AlertSeverity } from '../../types';
import { getSeverityClasses } from '../../utils/statusColors';

interface SeverityBadgeProps {
  severity: AlertSeverity;
  size?: 'sm' | 'md';
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = 'sm',
}) => {
  const { bg, border } = getSeverityClasses(severity);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-bold tracking-wider uppercase rounded-md border ${bg} ${border} ${sizeClasses}`}
    >
      {severity}
    </span>
  );
};

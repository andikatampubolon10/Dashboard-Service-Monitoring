import React, { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, HelpCircle } from 'lucide-react';
import { formatDeltaPercent } from '../../utils/formatters';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  deltaPercent?: number;
  deltaLabel?: string;
  subtext?: string | ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  statusColor?: 'emerald' | 'amber' | 'rose' | 'cyan' | 'default';
  tooltip?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  deltaPercent,
  deltaLabel = 'vs prev window',
  subtext,
  icon,
  onClick,
  statusColor = 'default',
  tooltip,
}) => {
  const delta = deltaPercent !== undefined ? formatDeltaPercent(deltaPercent) : null;

  const valueColorClass = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    default: 'text-slate-900 dark:text-white',
  }[statusColor];

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl transition-all duration-150 ${
        onClick
          ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
          : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-slate-400">{icon}</span>}
          <span>{title}</span>
          {tooltip && (
            <span title={tooltip} className="cursor-help text-slate-400 hover:text-slate-300">
              <HelpCircle className="w-3 h-3" />
            </span>
          )}
        </div>

        {delta && (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              delta.isNeutral
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                : delta.isPositive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {delta.isNeutral ? (
              <Minus className="w-2.5 h-2.5 mr-0.5" />
            ) : delta.isPositive ? (
              <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
            ) : (
              <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />
            )}
            {delta.text}
          </span>
        )}
      </div>

      {/* Main Value */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tracking-tight ${valueColorClass}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>

      {/* Footer Subtext */}
      {(subtext || deltaLabel) && (
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="truncate">{subtext}</div>
          {delta && !subtext && <div className="text-[10px] text-slate-400">{deltaLabel}</div>}
        </div>
      )}
    </div>
  );
};

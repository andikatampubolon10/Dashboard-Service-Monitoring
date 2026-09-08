import { HealthStatus, AlertSeverity, LogLevel } from '../types';

export function getHealthStatusClasses(status: HealthStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  pulse: boolean;
} {
  switch (status) {
    case 'healthy':
      return {
        bg: 'bg-emerald-500/10 dark:bg-emerald-500/10',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-500/30',
        dot: 'bg-emerald-500',
        pulse: false,
      };
    case 'warning':
    case 'degraded':
      return {
        bg: 'bg-amber-500/10 dark:bg-amber-500/10',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        pulse: true,
      };
    case 'critical':
      return {
        bg: 'bg-rose-500/10 dark:bg-rose-500/10',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-500/30',
        dot: 'bg-rose-500',
        pulse: true,
      };
    case 'offline':
    default:
      return {
        bg: 'bg-slate-500/10 dark:bg-slate-500/10',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/30',
        dot: 'bg-slate-400',
        pulse: false,
      };
  }
}

export function getSeverityClasses(severity: AlertSeverity): {
  bg: string;
  text: string;
  border: string;
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-500/30',
      };
    case 'warning':
      return {
        bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-500/30',
      };
    case 'info':
    default:
      return {
        bg: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
        text: 'text-cyan-700 dark:text-cyan-400',
        border: 'border-cyan-500/30',
      };
  }
}

export function getLogLevelClasses(level: LogLevel): {
  badge: string;
  rowText: string;
} {
  switch (level) {
    case 'FATAL':
    case 'ERROR':
      return {
        badge: 'bg-rose-500 text-white font-bold',
        rowText: 'text-rose-300 dark:text-rose-400',
      };
    case 'WARN':
      return {
        badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold',
        rowText: 'text-amber-300 dark:text-amber-300',
      };
    case 'INFO':
      return {
        badge: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
        rowText: 'text-slate-300 dark:text-slate-300',
      };
    case 'DEBUG':
    default:
      return {
        badge: 'bg-slate-700/50 text-slate-400 border border-slate-600/30',
        rowText: 'text-slate-400 dark:text-slate-400',
      };
  }
}

export function getStatusCodeColor(code: number): string {
  if (code >= 500) return 'text-rose-600 dark:text-rose-400';
  if (code >= 400) return 'text-amber-600 dark:text-amber-400';
  if (code >= 300) return 'text-blue-600 dark:text-blue-400';
  if (code >= 200) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-400';
}

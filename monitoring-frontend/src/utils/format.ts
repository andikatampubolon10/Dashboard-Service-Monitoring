export * from './formatters';

import { formatNumber, formatLatency, formatPercent, formatBytes } from './formatters';

export const fmtNumber = formatNumber;
export const fmtLatency = formatLatency;
export const fmtPercent = formatPercent;
export const fmtCompact = formatNumber;
export const fmtBytes = formatBytes;

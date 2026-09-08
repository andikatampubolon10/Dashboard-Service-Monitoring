// Utility functions for formatting numbers, bytes, latency, and percentages

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 10_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toLocaleString('en-US');
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return (ms / 1000).toFixed(2) + ' s';
  }
  if (ms >= 100) {
    return Math.round(ms) + ' ms';
  }
  return ms.toFixed(1) + ' ms';
}

export function formatPercent(val: number, decimals = 2): string {
  return val.toFixed(decimals) + '%';
}

export function formatRps(rps: number): string {
  if (rps >= 1000) {
    return (rps / 1000).toFixed(1) + 'k RPS';
  }
  return rps.toFixed(1) + ' RPS';
}

export function formatDeltaPercent(val: number): { text: string; isPositive: boolean; isNeutral: boolean } {
  if (Math.abs(val) < 0.01) {
    return { text: '0.0%', isPositive: true, isNeutral: true };
  }
  const sign = val > 0 ? '+' : '';
  return {
    text: `${sign}${val.toFixed(1)}%`,
    isPositive: val > 0,
    isNeutral: false,
  };
}

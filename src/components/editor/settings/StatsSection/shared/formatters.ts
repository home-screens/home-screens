import type { SemanticColor } from './types';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Split a byte count into "20.3" and "GB" so we can style the unit separately. */
export function splitBytes(bytes: number): { value: string; unit: string } {
  if (bytes <= 0) return { value: '0', unit: 'B' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return { value: v < 10 ? v.toFixed(1) : String(Math.round(v)), unit: units[i] };
}

export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

/** Shorten API URL for display: /api/weather?lat=40.7... → /api/weather */
export function shortenUrl(url: string): string {
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.slice(0, qIndex) : url;
}

export function percentColor(percent: number): SemanticColor {
  if (percent > 90) return 'danger';
  if (percent > 70) return 'warning';
  return 'success';
}

export function colorVar(c: SemanticColor): string {
  return `var(--hs-${c})`;
}

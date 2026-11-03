import type { SemanticColor } from './types';

// so the unit can be styled separately from the value
export function splitBytes(bytes: number): { value: string; unit: string } {
  if (bytes <= 0) return { value: '0', unit: 'B' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return { value: v < 10 ? v.toFixed(1) : String(Math.round(v)), unit: units[i] };
}

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

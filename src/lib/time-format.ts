/**
 * Relative-time / duration formatters shared across the editor, remote, and
 * settings surfaces. These helpers do simple integer arithmetic (no Intl,
 * no date-fns) and emit hard-coded English suffixes — "5s ago", "2h 30m",
 * "<1s". They survive the i18n cutover unchanged because every consumer
 * expects exactly these compact strings (heartbeat freshness chips, uptime
 * pills) and matches their layout against the fixed character widths.
 *
 * If a future task needs localized relative-time output, prefer
 * `formatRelativeTime` from `@/i18n/formatters` (Intl.RelativeTimeFormat
 * under the hood) — do not localize these helpers in place; their shape
 * is part of the API.
 */

/**
 * "5s ago" / "3m ago" / "2h ago" / "4d ago" — used for heartbeat freshness.
 * Returns "—" when `lastSeen` is null/0 so callers can render the em-dash
 * placeholder without branching.
 */
export function formatLastSeen(lastSeen: number | null | undefined): string {
  if (!lastSeen) return '—';
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

/** Compact uptime — "2d 3h 15m" / "5h 12m" / "42m". Input is seconds. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

/**
 * Compact age (no "ago" suffix) — "<1s" / "42s" / "12m" / "3h 15m". Input is
 * milliseconds. Different from `formatLastSeen` because the caller appends
 * the verb in context (e.g. "Last seen 3m ago").
 */
export function formatAge(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

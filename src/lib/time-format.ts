/**
 * Compact time formatters for the editor's status chips and pills.
 *
 * `formatLastSeen` reads in the editor's language. `formatUptime` and
 * `formatAge` are plain integer arithmetic with fixed letters ("2h 30m",
 * "<1s"): their callers lay a chip out against those widths and add their
 * own words around them.
 */
import { compactRelativeStyle, relativeTimeFormatter } from '@/i18n/formatters';

function lastSeenWith(rtf: Intl.RelativeTimeFormat, diff: number): string {
  if (diff < 60_000) return rtf.format(-Math.max(1, Math.round(diff / 1000)), 'second');
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  return rtf.format(-Math.round(diff / 86_400_000), 'day');
}

/**
 * How long ago a display was last heard from: "5s ago", "3m ago", "2h ago",
 * "4d ago" in English and the language's own short form elsewhere ("vor 5
 * Sek.", "il y a 3 min"). Never less than one second, and days are the
 * largest unit. The caller decides what a display that has never been heard
 * from says; this takes a real time.
 */
export function formatLastSeen(lastSeen: number, locale: string, now: number = Date.now()): string {
  const diff = now - lastSeen;
  try {
    return lastSeenWith(relativeTimeFormatter(locale, 'always', compactRelativeStyle(locale)), diff);
  } catch {
    return lastSeenWith(relativeTimeFormatter('en-US', 'always', 'narrow'), diff);
  }
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

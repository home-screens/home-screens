import { editorFetch } from '@/lib/editor-fetch';
import { downloadBlob } from '@/lib/download';
import { timestampInTZ } from '@/lib/timezone';
import type { DisplayStatus } from '@/lib/display-commands';
import type { SystemStats } from '@/lib/system-stats-types';

export async function fetchStats(): Promise<
  | { ok: true; stats: SystemStats }
  | { ok: false; error: string }
> {
  try {
    const res = await editorFetch('/api/system/stats');
    if (res.ok) {
      return { ok: true, stats: (await res.json()) as SystemStats };
    }
    return { ok: false, error: 'Failed to load system stats' };
  } catch {
    return { ok: false, error: 'Failed to reach server' };
  }
}

/**
 * Returns the display status, or `null` when the display has not reported yet
 * or the server responds non-OK. Throws on network exceptions so callers can
 * distinguish a transient failure (keep last known state) from an
 * authoritative "offline" response (clear state).
 */
export async function fetchDisplayStatus(
  selectedDisplayId: string | null,
): Promise<DisplayStatus | null> {
  const url = selectedDisplayId
    ? `/api/display/status?display=${encodeURIComponent(selectedDisplayId)}`
    : '/api/display/status';
  const res = await editorFetch(url);
  if (res.ok) {
    return (await res.json()) as DisplayStatus | null;
  }
  return null;
}

/**
 * The diagnostics download's name, stamped with the household's day and time
 * ("home-screens-diagnostics-2026-09-24-2047.zip") so it matches the clock on
 * the wall rather than UTC.
 */
export function diagnosticsFileName(timezone: string | undefined, now: Date = new Date()): string {
  const stamp = timestampInTZ(now, timezone);
  return `home-screens-diagnostics-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}.zip`;
}

export async function generateBundle(timezone: string | undefined): Promise<void> {
  const res = await editorFetch('/api/system/diagnostics');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  downloadBlob(blob, diagnosticsFileName(timezone));
}

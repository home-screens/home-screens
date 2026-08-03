import { editorFetch } from '@/lib/editor-fetch';
import { downloadBlob } from '@/lib/download';
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
 * Returns the display status, or `null` when the server responds non-OK
 * (display not connected). Throws on network exceptions so callers can
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
    return (await res.json()) as DisplayStatus;
  }
  return null;
}

export async function generateBundle(): Promise<void> {
  const res = await editorFetch('/api/system/diagnostics');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `home-screens-diagnostics-${ts}.zip`);
}

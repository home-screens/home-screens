import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import {
  getAllDisplayStatuses,
  getUnadoptedDisplays,
  getViewportReports,
} from '@/lib/display-commands';
import { withDisplayAuth } from '@/lib/api-utils';
import type { ScreenConfiguration } from '@/types/config';
import type { DisplaysApiResponse } from '@/lib/displays-api-types';

export const dynamic = 'force-dynamic';

/**
 * Tiny in-process cache for `readConfig()` results. The Displays tab in the
 * editor and every unadopted display poll this route every 5 s, so a single
 * household with 5 unadopted Pis can drive ~6 disk reads / 5 s. The 1.5 s
 * TTL collapses concurrent polls onto one read while still surfacing
 * editor changes within the next refresh cycle.
 */
const CONFIG_CACHE_TTL_MS = 1_500;
let configCache: { value: ScreenConfiguration; expiresAt: number } | null = null;

async function getCachedConfig(): Promise<ScreenConfiguration> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.value;
  const value = await readConfig();
  configCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

/**
 * Read-only endpoint exposing the multi-display registry alongside the
 * runtime heartbeat data the hub has collected from polling displays.
 *
 * Two modes:
 *
 * - **`GET /api/displays?id=<id>`** — used by `DisplayNotFound` on the
 *   display-only Pis. Returns `{adopted}`. The display polls this every
 *   few seconds while waiting to be adopted; the moment `adopted: true`
 *   it reloads the page and the per-display route mounts the rotator.
 *
 * - **`GET /api/displays`** — used by the editor's Displays tab. Returns
 *   the registered displays from `config.json`, plus the unadopted IDs
 *   that have polled the hub but are not yet in the registry, plus per-
 *   display heartbeat (`lastSeen`) and last-known status.
 *
 * This route is read-only — all writes go through `/api/config` (via the
 * editor store) so undo/redo and validation stay consistent.
 */
export const GET = withDisplayAuth(async (request) => {
  const id = request.nextUrl.searchParams.get('id');

  // Adoption-check shortcut: only the registered display IDs are needed,
  // and we read those from the cached config to avoid hammering the disk
  // when many Pis poll for adoption simultaneously.
  if (id) {
    const config = await getCachedConfig();
    const adopted = (config.displays ?? []).some((d) => d.id === id);
    return NextResponse.json({ adopted, displayId: id });
  }

  const config = await getCachedConfig();
  const registered = config.displays ?? [];
  const statuses = getAllDisplayStatuses();
  const unadopted = getUnadoptedDisplays(registered.map((d) => d.id));

  // Typed against the shared wire contract so the payload the clients
  // declare (displays-api-types.ts) can't drift from what this route emits.
  const payload: DisplaysApiResponse = {
    displays: registered.map((d) => {
      const status = statuses.get(d.id);
      const viewportReports = getViewportReports(d.id);
      // Return a precomputed screen count rather than the full `screens`
      // array. The editor's Displays tab only renders the count, and the
      // full `screens` array would include every module's config
      // (potentially ~100KB per poll, every 5s, and potentially containing
      // plugin-configured secrets).
      const screenCount = d.screens.length;
      return {
        id: d.id,
        name: d.name,
        screenCount,
        activeProfile: d.activeProfile,
        settings: d.settings,
        displayWidth: d.displayWidth,
        displayHeight: d.displayHeight,
        displayTransform: d.displayTransform,
        lastSeen: status?.lastSeen ?? null,
        // Back-compat: the first (most recent) viewport stays in the old
        // single-value field so older editor builds keep working, while the
        // full list lets the current editor surface multi-client conflicts.
        reportedViewport: viewportReports[0]
          ? { width: viewportReports[0].width, height: viewportReports[0].height }
          : status?.reportedViewport,
        viewportReports,
        status: status
          ? {
              currentScreen: status.currentScreen,
              displayState: status.displayState,
              activeProfile: status.activeProfile,
            }
          : null,
      };
    }),
    unadopted: unadopted.map((unadoptedId) => {
      const status = statuses.get(unadoptedId);
      const viewportReports = getViewportReports(unadoptedId);
      return {
        id: unadoptedId,
        lastSeen: status?.lastSeen ?? null,
        reportedViewport: viewportReports[0]
          ? { width: viewportReports[0].width, height: viewportReports[0].height }
          : status?.reportedViewport,
        viewportReports,
      };
    }),
  };
  return NextResponse.json(payload);
}, 'Failed to read displays');

/** Test-only escape hatch for clearing the per-process config cache. */
export function __clearDisplaysCacheForTests(): void {
  configCache = null;
}

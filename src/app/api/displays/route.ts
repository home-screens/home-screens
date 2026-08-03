import { NextResponse } from 'next/server';
import { readConfigCached } from '@/lib/config-cache';
import {
  getAllDisplayStatuses,
  getUnadoptedDisplays,
  getViewportReports,
} from '@/lib/display-commands';
import { withDisplayAuth } from '@/lib/api-utils';
import type { DisplaysApiResponse } from '@/lib/displays-api-types';

export const dynamic = 'force-dynamic';

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
  // when many Pis poll for adoption simultaneously. The editor Displays
  // tab and every unadopted Pi hit this route every 5 s; the shared 1.5 s
  // cache (`config-cache.ts`) collapses those polls onto one disk read.
  if (id) {
    const config = await readConfigCached();
    const adopted = (config.displays ?? []).some((d) => d.id === id);
    return NextResponse.json({ adopted, displayId: id });
  }

  const config = await readConfigCached();
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

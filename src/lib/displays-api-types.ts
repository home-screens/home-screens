import type { ViewportReport, DisplayStatus } from '@/lib/display-commands';
import type { DisplayNodeSettings } from '@/types/config';

/**
 * Wire types for `GET /api/displays`, shared between the route (producer)
 * and the editor's polling consumers (SettingsSidebar, DisplaysIndexPage,
 * PerDisplayPage). Type-only — importing from here never pulls server
 * runtime code into a client bundle.
 */

export type { ViewportReport };

/** Back-compat single-value viewport (the first entry of `viewportReports`). */
export interface ReportedViewport {
  width: number;
  height: number;
}

/**
 * Shape of the per-display entry returned by GET /api/displays. Intentionally
 * does NOT extend `DisplayNode` — the route only returns metadata (id, name,
 * dims, screenCount), not the full `screens` array, to avoid leaking module
 * configs (potentially containing plugin secrets) and to keep the poll
 * payload tiny even for households with many displays.
 */
export interface DisplayApiEntry {
  id: string;
  name: string;
  screenCount: number;
  activeProfile?: string;
  settings?: DisplayNodeSettings;
  displayWidth?: number;
  displayHeight?: number;
  displayTransform?: 'normal' | '90' | '180' | '270';
  lastSeen: number | null;
  reportedViewport?: ReportedViewport;
  viewportReports: ViewportReport[];
  status: Pick<DisplayStatus, 'currentScreen' | 'displayState' | 'activeProfile'> | null;
}

/** A display that has polled the hub but is not yet in the registry. */
export interface UnadoptedDisplay {
  id: string;
  lastSeen: number | null;
  reportedViewport?: ReportedViewport;
  viewportReports: ViewportReport[];
}

export interface DisplaysApiResponse {
  displays: DisplayApiEntry[];
  unadopted: UnadoptedDisplay[];
}

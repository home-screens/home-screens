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
  /**
   * The state of this Pi's local shell layer (kiosk launcher, splash,
   * reporter, systemd units), lifted out of `hwStats` so the poll payload
   * doesn't have to carry the whole hardware snapshot.
   *
   * Absent when the Pi has never run the hardware reporter at all — a hub Pi
   * rendering its own display, or a spoke that has not reported yet. That is
   * a distinct state from `{ updater: false }`, which means a reporter DID
   * run and found no self-updater installed.
   */
  displaySoftware?: DisplaySoftwareInfo;
}

export interface DisplaySoftwareInfo {
  /** Whether this Pi updates its shell layer from the hub automatically. */
  updater: boolean;
  /** Applied bundle version, or null before the first update lands. */
  version: string | null;
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
  /**
   * The hub's own app version. Included here so the editor can say whether a
   * display's software is current without a second round trip — and, more
   * importantly, without going through `/api/system/version`, which consults
   * GitHub. "Is this display in step with this hub?" is a purely local
   * question and must keep answering correctly with no internet.
   */
  hubVersion: string;
}

/**
 * Module-level storage for host settings exposed to plugins via
 * `window.__HS_SDK__.getHostSettings()`.
 *
 * The display's ScreenRotator calls `setHostSettings()` whenever the config
 * changes; `getHostSettings()` returns a frozen snapshot to plugins.
 */

import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';

export interface HostSettings {
  timezone: string;
  units: 'metric' | 'imperial';
  latitude: number | null;
  longitude: number | null;
  displayWidth: number;
  displayHeight: number;
  appVersion: string;
}

let _settings: HostSettings = {
  // A placeholder until the host pushes the household's zone, which it does
  // in a layout effect before any plugin renders.
  timezone: 'UTC',
  units: 'imperial',
  latitude: null,
  longitude: null,
  displayWidth: DEFAULT_DISPLAY_WIDTH,
  displayHeight: DEFAULT_DISPLAY_HEIGHT,
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
};

/** Called by host components (ScreenRotator) to push updated settings. */
export function setHostSettings(settings: HostSettings): void {
  _settings = settings;
}

/** Returns a shallow copy of current host settings. */
export function getHostSettings(): HostSettings {
  return { ..._settings };
}

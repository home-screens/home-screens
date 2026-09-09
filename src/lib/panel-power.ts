import type { ScreenConfiguration } from '@/types/config';

/**
 * "Should this display's panel be powered right now?"
 *
 * Home Screens sleep is a black overlay drawn by the browser; the HDMI signal
 * stays live and an LCD backlight glows in a dark room. When a display opts
 * in (`sleep.panelPowerOff`), a small agent in the kiosk session polls
 * `GET /api/display/power-state` and cuts panel power with `wlopm` while the
 * hub says `off`. The hub decides rather than the agent because the truth
 * lives here: the browser reports its sleep state in every heartbeat, and
 * per-display sleep settings are resolved server-side.
 *
 * The panel follows the overlay, never the schedule: driving off the reported
 * `displayState` means every sleep source (schedule, idle, remote command,
 * rule action, brightness 0) and every wake source (touch, remote, alerts,
 * timers, rule takeovers, the wake hold) works without a special case.
 */

export type PanelPower = 'on' | 'off';

/**
 * A browser heartbeat older than this no longer proves the browser is alive.
 * A dead tab must bring the panel back so whoever walks up can see what
 * broke; a black panel that never wakes is the worst failure mode this
 * feature can have. The command poll refreshes `browserSeen` every 3s, so 90s
 * rides out a long GC pause or a WiFi blip without flashing the panel on.
 *
 * This is `DisplayStatus.browserSeen`, not `lastSeen`: the Pi's hardware
 * reporter keeps `lastSeen` fresh every 30s whether or not the browser is
 * running, while the crashed browser's last `displayState` stays frozen.
 */
export const PANEL_POWER_HEARTBEAT_FRESH_MS = 90_000;

export interface PanelPowerInput {
  /** Effective `sleep.enabled && sleep.panelPowerOff` for this display. */
  enabled: boolean;
  /** Live state from the display's heartbeat, if it has one. */
  displayState: 'active' | 'dimmed' | 'asleep' | null | undefined;
  /** Server-side timestamp of the browser's last poll or heartbeat, if any. */
  browserSeen: number | null | undefined;
  now: number;
}

/**
 * `off` only when everything lines up; every ambiguity resolves to `on`.
 * `dimmed` keeps the panel on: the screensaver and dimmed content are meant
 * to be seen.
 */
export function computePanelPower(input: PanelPowerInput): PanelPower {
  if (!input.enabled) return 'on';
  if (input.displayState !== 'asleep') return 'on';
  if (typeof input.browserSeen !== 'number' || !Number.isFinite(input.browserSeen)) return 'on';
  if (input.now - input.browserSeen > PANEL_POWER_HEARTBEAT_FRESH_MS) return 'on';
  return 'off';
}

/**
 * Whether panel power-off is switched on for one display. Per-display
 * `settings.sleep` is full-replacement, not deep-merged (matching
 * `filterConfigForDisplay` and `resolveDisplayRestartInputs`), so a display
 * with its own sleep block is read on its own terms.
 */
export function resolvePanelPowerEnabled(config: ScreenConfiguration, displayId: string): boolean {
  const display = config.displays?.find((d) => d.id === displayId);
  const sleep = display?.settings?.sleep ?? config.settings.sleep;
  return Boolean(sleep?.enabled && sleep.panelPowerOff);
}

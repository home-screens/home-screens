/**
 * Which of an update's system changes leave the wall out of date until the
 * Pi restarts.
 *
 * Every install ends with `scripts/upgrade.sh setup-system`, which brings the
 * Pi's own configuration in line with the new release and reports what it
 * changed on its last line, as `{"ok":true,"changed":"launcher,packages"}`
 * (or `"changed":null`). Most of those changes take effect by themselves, or
 * only matter at the next boot anyway (the boot splash, kernel options,
 * swap). A few are read once, when the kiosk session starts, and the running
 * wall keeps the old ones until the Pi restarts. A feature that depends on
 * them quietly does nothing in the meantime: that is how "switch the
 * screen's power off" first reached a household, doing nothing until they
 * happened to reboot.
 */

import { parseLastLineObject } from './script-output';

/**
 * setup-system's names for the changes a running kiosk session does not pick
 * up: the launcher it started from, the panel power agent that launcher
 * started (it runs as long as Chromium does), the login script that starts
 * the launcher, labwc's autostart, the legacy kiosk service, and new
 * packages the session runs (wlopm for the panel power agent, kanshi for the
 * screen settings).
 *
 * Left out on purpose: `labwc-rc` (the app reloads labwc itself), `kiosk-conf`
 * (setup-system puts the new screen settings on the screen itself), `packages`
 * (reported for any install, an editor or a font included; the ones a session
 * runs are reported again as `session-packages`), and the changes that only
 * apply at the next boot but leave nothing on the wall looking wrong until
 * then, such as `brcmfmac-modprobe` and `tmpfs-mounts`.
 */
export const RESTART_NEEDED_CHANGES: readonly string[] = [
  'launcher',
  'power-agent',
  'bash-profile',
  'labwc-autostart',
  'legacy-kiosk',
  'session-packages',
];

/**
 * The change names setup-system reported, from the JSON on its last line. An
 * empty list when it reported none, or when its output cannot be read: a
 * restart notice is a courtesy, and never a reason to fail an update.
 */
export function parseSetupSystemChanges(output: string): string[] {
  const { changed } = parseLastLineObject(output, {});
  if (typeof changed !== 'string') return [];
  return changed.split(',').map((name) => name.trim()).filter(Boolean);
}

/** The changes among `changed` that only a restart picks up, first seen first, without repeats. */
export function restartNeededFor(changed: readonly string[]): string[] {
  return [...new Set(changed.filter((name) => RESTART_NEEDED_CHANGES.includes(name)))];
}

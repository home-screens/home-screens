/**
 * One definition of how fresh a display's heartbeat is, for every surface that
 * draws a status dot: the editor toolbar switcher, the settings sidebar, the
 * displays index, the per-display page and the family remote.
 *
 * `lastSeen` is the hub-stamped time of the display's last heartbeat (see
 * `display-commands.ts`, which stamps it). The display client posts at least
 * every 30s. Never derive liveness from when the viewing device last polled
 * the hub, which only proves the phone or laptop is online.
 */

/** Heard from within one heartbeat interval. */
export const ONLINE_WITHIN_MS = 30_000;

/** Missed a few beats but not long enough to call it gone. */
export const IDLE_WITHIN_MS = 300_000;

/**
 * The remote is stricter than the editor's `offline` band on purpose: it gates
 * the sleep, brightness and navigation buttons, so it says "offline" after two
 * missed beats rather than leaving a parent tapping a display that is unplugged.
 */
export const REMOTE_OFFLINE_AFTER_MS = 60_000;

/** How long a command stays "waiting" for the display to confirm before the remote reverts it. */
export const CONFIRM_TIMEOUT_MS = 10_000;

export type HeartbeatState = 'online' | 'idle' | 'offline';

/** Bucket a heartbeat into the three states every editor status dot uses. */
export function heartbeatState(lastSeen: number | null | undefined, now = Date.now()): HeartbeatState {
  if (!lastSeen) return 'offline';
  const age = now - lastSeen;
  if (age < ONLINE_WITHIN_MS) return 'online';
  if (age < IDLE_WITHIN_MS) return 'idle';
  return 'offline';
}

/** A display's status pill: the three heartbeat states, plus one that has never checked in. */
export type HeartbeatPillKind = HeartbeatState | 'never';

export interface HeartbeatPill {
  kind: HeartbeatPillKind;
  /** Background, border and text classes for the pill itself. */
  pillClass: string;
  /** The small dot in front of the words. */
  dotClass: string;
}

/**
 * How the editor draws a display's status pill, for the displays list and the
 * display's own page. A display never heard from takes the offline colours
 * with no visible border, so one that has yet to check in does not read as one
 * that went away; its words are the caller's ("Offline", with no time).
 */
export function heartbeatPill(lastSeen: number | null | undefined, now = Date.now()): HeartbeatPill {
  if (!lastSeen) return { kind: 'never', pillClass: 'bg-hs-card border-transparent text-hs-text-muted', dotClass: 'bg-hs-card' };
  switch (heartbeatState(lastSeen, now)) {
    case 'online':
      return { kind: 'online', pillClass: 'bg-hs-success/10 border-hs-success/30 text-hs-success', dotClass: 'bg-hs-success' };
    case 'idle':
      return { kind: 'idle', pillClass: 'bg-hs-warning/10 border-hs-warning/30 text-hs-warning', dotClass: 'bg-hs-warning' };
    case 'offline':
      return { kind: 'offline', pillClass: 'bg-hs-card border-hs-border-strong text-hs-text-muted', dotClass: 'bg-hs-card' };
  }
}

/** True while a display has been heard from within one heartbeat interval. */
export function isOnlineNow(lastSeen: number | null | undefined, now = Date.now()): boolean {
  return heartbeatState(lastSeen, now) === 'online';
}

/** The remote's binary "this display is not answering" test. */
export function isOfflineSince(lastSeen: number | null | undefined, now = Date.now()): boolean {
  return lastSeen != null && now - lastSeen > REMOTE_OFFLINE_AFTER_MS;
}

/** What one display last told the hub about its brightness, with when it was last heard from. */
export interface BrightnessReport {
  lastSeen: number | null | undefined;
  brightness?: number | null;
}

/**
 * The brightness a brightness control shows for the displays it is aimed at:
 * the one number they all report, or null for "not known" (nothing reported,
 * or two displays at different levels).
 *
 * Only displays that are answering count, by the remote's strict band
 * (`REMOTE_OFFLINE_AFTER_MS`): one that is unplugged, or has never checked
 * in, neither sets the number nor blocks it, because a command sent now
 * would not reach it either. An answering display that has not reported a
 * level yet is skipped the same way. The phone's brightness card and the
 * wall's Display Control both read this, so "All displays" with one wall
 * switched off shows the level of the walls that are on.
 */
export function agreedBrightness(reports: ReadonlyArray<BrightnessReport>, now = Date.now()): number | null {
  const levels = reports.flatMap((report) => (
    report.lastSeen && !isOfflineSince(report.lastSeen, now) && typeof report.brightness === 'number' ? [report.brightness] : []
  ));
  if (levels.length === 0) return null;
  return levels.every((level) => level === levels[0]) ? levels[0] : null;
}

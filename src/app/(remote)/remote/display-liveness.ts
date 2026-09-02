/**
 * One definition of "this display is offline" for every remote surface.
 *
 * `lastSeen` is the hub-stamped time of the display's last heartbeat. The
 * display client posts at least every 30s, so a minute of silence means the
 * Pi is off, unplugged, or off the network. Never derive liveness from when
 * the phone last polled the hub — that only proves the phone is online.
 */
export const OFFLINE_AFTER_MS = 60_000;

/** How long a command stays "waiting" for the display to confirm before the remote reverts it. */
export const CONFIRM_TIMEOUT_MS = 10_000;

export function isOfflineSince(lastSeen: number | null | undefined, now = Date.now()): boolean {
  return lastSeen != null && now - lastSeen > OFFLINE_AFTER_MS;
}

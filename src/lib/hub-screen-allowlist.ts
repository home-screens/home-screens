import { isIpAllowed } from './ip-allowlist';
import type { WallEntry } from './display-walls';

/**
 * "Only allow these networks" and the screen plugged into the hub.
 *
 * That screen opens the wall at `localhost` (scripts/kiosk-launcher-hub.sh),
 * so its requests come from 127.0.0.1, which a home network range like
 * 192.168.1.0/24 does not cover: saving such a list used to blank it with
 * "Access restricted" and nothing on the Security page said why. Loopback is
 * not let through on its own, because behind a reverse proxy on the same box
 * every visitor arrives as 127.0.0.1; the household adds it, and is asked to.
 */
export const HUB_SCREEN_ADDRESS = '127.0.0.1';

const LOOPBACK = new Set(['127.0.0.1', '::1']);

/**
 * Whether this hub has a screen of its own: a wall it has let in that opens
 * from the hub itself. Never where the install says it has none (the Docker
 * image's port forwarding can make outside callers look local).
 */
export function hasHubScreen(walls: readonly Pick<WallEntry, 'status' | 'address'>[]): boolean {
  if (process.env.HS_NO_HUB_SCREEN === '1') return false;
  return walls.some((wall) => wall.status === 'in' && LOOPBACK.has(wall.address));
}

/** Whether these network settings turn the hub's own screen away. */
export function leavesOutHubScreen(
  settings: { allowlist: readonly string[]; restrictAccess: boolean },
  hubHasScreen: boolean,
): boolean {
  return hubHasScreen
    && settings.restrictAccess
    && settings.allowlist.length > 0
    && !isIpAllowed(HUB_SCREEN_ADDRESS, [...settings.allowlist]);
}

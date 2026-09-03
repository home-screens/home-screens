import os from 'os';

/**
 * Which of the hub's own addresses to print on a wall.
 *
 * A kiosk running on the hub Pi opens `http://localhost:3000/display`, so
 * anything that prints `window.location.origin` on that wall (the setup
 * watermark, the empty photo screen, the chores and meals empty states) says
 * "localhost", which is useless to the person holding a phone. This picks the
 * address that phone can actually reach: the first non-internal IPv4 on a
 * real interface. Wired first, then Wi-Fi, then anything else that is not a
 * container bridge or a tunnel.
 */

/** Interface-name prefixes that never carry the LAN a phone is on. */
const NEVER = /^(docker|veth|br-|virbr|tailscale|tun|tap|wg|zt|utun|lo)/;

function rank(name: string): number {
  if (/^(eth|en|end|enp|enx)/.test(name)) return 0;
  if (/^(wl|wlan|wlp|wlx)/.test(name)) return 1;
  return 2;
}

type Interfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** The hub's LAN IPv4, or null when no real interface has one. */
export function pickLanIpv4(interfaces: Interfaces = os.networkInterfaces()): string | null {
  const candidates: { name: string; address: string }[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos || NEVER.test(name)) continue;
    for (const info of infos) {
      if (info.internal || info.family !== 'IPv4') continue;
      if (info.address.startsWith('169.254.')) continue; // link-local, no DHCP lease yet
      candidates.push({ name, address: info.address });
    }
  }
  candidates.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return candidates[0]?.address ?? null;
}

/**
 * Safe shell execution layer for NetworkManager operations.
 *
 * This is the ONLY module that touches the system. Every nmcli call goes
 * through here. The cardinal rule: no `exec()`, no `bash -c`, no template
 * literals in commands. Always `execFile()` with explicit argument arrays.
 *
 * Safety properties:
 * - `execFile` never spawns a shell — arguments can't escape
 * - `LANG=C.UTF-8` ensures consistent parseable output
 * - Write mutex prevents overlapping nmcli state mutations
 * - 15-second timeout prevents hanging on unresponsive hardware
 * - Rollback uses structured args, never shell interpolation
 */

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { parseTerseFields } from '@/lib/network-parse';

const log = logger('network-commands');

const execFileAsync = promisify(execFileCb);

/* ─── Constants ──────────────────────────────── */

const NMCLI_TIMEOUT_MS = 15_000;
const ROLLBACK_TIMEOUT_MS = 60_000;
const WATCHDOG_SENTINEL = '/tmp/home-screens-network-change';
const WATCHDOG_INHIBIT_DURATION_MS = 180_000;

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Stable locale for parseable nmcli output. */
const EXEC_ENV = { ...process.env, LANG: 'C.UTF-8' };

/* ─── Write mutex ────────────────────────────── */

/**
 * Serializes privileged nmcli calls through a Promise chain.
 * Each `nmcliSudo` call appends to this chain so mutations
 * never overlap (important for nmcli state consistency).
 */
let writeMutex: Promise<unknown> = Promise.resolve();

/* ─── Read-only nmcli ────────────────────────── */

/**
 * Execute a read-only nmcli command (no sudo).
 *
 * @param args - Argument array passed directly to `execFile`.
 *               Never concatenated into a shell string.
 * @returns stdout from the command.
 */
export async function nmcli(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('nmcli', args, {
    timeout: NMCLI_TIMEOUT_MS,
    env: EXEC_ENV,
  });
  return stdout;
}

/* ─── Privileged nmcli ───────────────────────── */

/**
 * Execute a privileged nmcli command with sudo, serialized
 * through the write mutex.
 *
 * @param args - Argument array for nmcli (sudo is prepended).
 * @param options.timeoutMs - Longer than the 15 s default only for a call
 *        that legitimately waits on the radio, such as `connection up`.
 * @returns stdout from the command.
 */
export async function nmcliSudo(
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const task = writeMutex.then(async () => {
    const { stdout } = await execFileAsync('sudo', ['nmcli', ...args], {
      timeout: options.timeoutMs ?? NMCLI_TIMEOUT_MS,
      env: EXEC_ENV,
    });
    return stdout;
  });

  // Always advance the mutex, even on failure, so subsequent calls
  // don't wait on a rejected promise forever.
  writeMutex = task.catch(() => {});

  return task;
}

/* ─── IPv4 settings capture ──────────────────── */

export interface Ipv4Settings {
  method: 'auto' | 'manual';
  addresses?: string;
  gateway?: string;
  dns?: string;
}

/**
 * Read the current IPv4 settings for a connection, for rollback capture.
 *
 * Throws when nmcli fails — callers choose their own fallback policy
 * (wifi/connect skips scheduling a rollback; ip assumes `auto` so the
 * rollback is still safe to schedule).
 */
export async function readConnectionIpv4Settings(connectionId: string): Promise<Ipv4Settings> {
  const connOutput = await nmcli([
    '-t', '-f', 'ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns',
    'connection', 'show', connectionId,
  ]);

  let method: 'auto' | 'manual' = 'auto';
  let addresses: string | undefined;
  let gateway: string | undefined;
  let dns: string | undefined;

  for (const line of connOutput.split('\n')) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).replace(/\\:/g, ':').trim();

    if (key === 'ipv4.method' && value === 'manual') method = 'manual';
    if (key === 'ipv4.addresses' && value) addresses = value;
    if (key === 'ipv4.gateway' && value) gateway = value;
    if (key === 'ipv4.dns' && value) dns = value;
  }

  return { method, ...(addresses && { addresses }), ...(gateway && { gateway }), ...(dns && { dns }) };
}

/* ─── Rollback ───────────────────────────────── */

export interface PendingRollback {
  id: string;
  connectionId: string;
  previousSettings: Ipv4Settings;
  timer: ReturnType<typeof setTimeout>;
  confirmed: boolean;
}

let pendingRollback: PendingRollback | null = null;
let pendingRollbackStartTime = 0;

/**
 * Schedule an automatic rollback that fires after 60 seconds
 * unless confirmed. If a rollback is already pending, it is
 * cancelled and replaced.
 *
 * Callers MUST validate `connectionId` (via `validateUUID`) before
 * passing it here — this module trusts its callers for input safety.
 *
 * @returns A unique rollback ID for confirmation.
 */
export function scheduleRollback(
  connectionId: string,
  previousSettings: PendingRollback['previousSettings'],
): string {
  // Cancel any existing pending rollback
  if (pendingRollback) {
    clearTimeout(pendingRollback.timer);
    pendingRollback = null;
  }

  const id = randomUUID();
  pendingRollbackStartTime = Date.now();

  const timer = setTimeout(() => {
    if (pendingRollback && pendingRollback.id === id && !pendingRollback.confirmed) {
      executeRollback(connectionId, previousSettings);
      pendingRollback = null;
    }
  }, ROLLBACK_TIMEOUT_MS);

  // Unref the timer so it doesn't keep the process alive during shutdown
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }

  pendingRollback = {
    id,
    connectionId,
    previousSettings,
    timer,
    confirmed: false,
  };

  return id;
}

/**
 * Execute the rollback by restoring previous connection settings.
 * Uses structured args — never shell interpolation.
 */
function executeRollback(
  connectionId: string,
  settings: PendingRollback['previousSettings'],
): void {
  const args: string[] = ['connection', 'modify', connectionId];

  if (settings.method === 'auto') {
    args.push('ipv4.method', 'auto');
    args.push('ipv4.addresses', '');
    args.push('ipv4.gateway', '');
    args.push('ipv4.dns', '');
  } else {
    args.push('ipv4.method', 'manual');
    if (settings.addresses) {
      args.push('ipv4.addresses', settings.addresses);
    }
    if (settings.gateway) {
      args.push('ipv4.gateway', settings.gateway);
    }
    if (settings.dns) {
      args.push('ipv4.dns', settings.dns);
    }
  }

  // Fire-and-forget: apply the modify, then bring the connection up, then clean up watchdog
  nmcliSudo(args)
    .then(() => nmcliSudo(['connection', 'up', connectionId]))
    .then(() => uninhibitWatchdog())
    .catch((err) => {
      // Best-effort rollback — if this fails, the network is already broken.
      // Log for operational visibility on headless Pi devices.
      log.error('rollback failed:', err?.message ?? err);
      // Still try to uninhibit watchdog so it can resume recovery
      uninhibitWatchdog().catch(() => {});
    });
}

/**
 * Confirm a pending rollback, cancelling the auto-revert timer.
 *
 * @returns `true` if the rollback was found and confirmed,
 *          `false` if no matching pending rollback exists.
 */
export function confirmRollback(rollbackId: string): boolean {
  if (!pendingRollback || pendingRollback.id !== rollbackId) {
    return false;
  }

  pendingRollback.confirmed = true;
  clearTimeout(pendingRollback.timer);
  pendingRollback = null;
  return true;
}

/**
 * Check whether a rollback is currently pending.
 * Used to reject concurrent management-interface changes.
 */
export function hasActiveRollback(): boolean {
  return pendingRollback !== null && !pendingRollback.confirmed;
}

/**
 * Check the current rollback state for UI polling.
 *
 * @returns The rollback ID and remaining timeout, or `null`.
 */
export function getPendingRollback(): { id: string; timeoutMs: number } | null {
  if (!pendingRollback || pendingRollback.confirmed) {
    return null;
  }

  const elapsed = Date.now() - pendingRollbackStartTime;
  const remaining = Math.max(0, ROLLBACK_TIMEOUT_MS - elapsed);

  return {
    id: pendingRollback.id,
    timeoutMs: remaining,
  };
}

/* ─── Watchdog inhibit/uninhibit ─────────────── */

/**
 * Write a sentinel file that tells the connectivity watchdog
 * to stand down while a network change is being applied.
 *
 * The sentinel contains an expiry timestamp so a stale file
 * from a crashed process doesn't inhibit forever.
 */
export async function inhibitWatchdog(): Promise<void> {
  const expiry = Date.now() + WATCHDOG_INHIBIT_DURATION_MS;
  await writeFile(WATCHDOG_SENTINEL, String(expiry), 'utf-8');
}

/**
 * Remove the watchdog sentinel file.
 * Swallows ENOENT (file already gone or never created).
 */
export async function uninhibitWatchdog(): Promise<void> {
  try {
    await unlink(WATCHDOG_SENTINEL);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return; // Already gone — nothing to do
    }
    throw err;
  }
}

/* ─── Management interface detection ─────────── */

/** Strict dotted-quad check before an address goes anywhere near execFile. */
function isValidIPv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false;
  return ip.split('.').every((part) => parseInt(part, 10) <= 255);
}

/**
 * Determine which network interface the browser is talking to the hub over.
 *
 * The adapter that owns the address the request arrived on is the answer
 * whenever that address is known (`localIP`, stamped from the socket by
 * `server-ip-patch.ts`). The older route lookup toward the client remains
 * the fallback: it names the adapter replies leave through, which is only
 * the same thing when the client sits on one of the hub's own subnets. A
 * laptop on a third subnet reaching wlan0's address would otherwise be
 * attributed to whichever adapter holds the default route.
 *
 * @param clientIP - The client's IPv4 address (validated first).
 * @param localIP - The hub address the request arrived on, when known.
 * @returns The interface name (e.g. "eth0") or `null` if neither lookup
 *          can say.
 */
export async function getManagementInterface(clientIP: string, localIP = ''): Promise<string | null> {
  if (localIP && isValidIPv4(localIP) && localIP !== '127.0.0.1') {
    try {
      const { stdout } = await execFileAsync('ip', ['-4', '-o', 'addr', 'show', 'to', localIP], {
        timeout: NMCLI_TIMEOUT_MS,
        env: EXEC_ENV,
      });
      // "3: wlan0    inet 192.168.86.143/24 brd ... scope global dynamic noprefixroute wlan0\ ..."
      const match = stdout.match(/^\d+:\s+(\S+)\s+inet\s/m);
      if (match) return match[1];
    } catch {
      // Fall through to the route lookup
    }
  }

  // Validate the IP before passing to execFile
  if (!isValidIPv4(clientIP)) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync('ip', ['route', 'get', clientIP], {
      timeout: NMCLI_TIMEOUT_MS,
      env: EXEC_ENV,
    });

    // Parse "dev <iface>" from output like:
    // 192.168.1.100 dev eth0 src 192.168.1.1 uid 0
    const match = stdout.match(/\bdev\s+(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a candidate interface could be the management interface
 * (the one serving the current HTTP session), for confirmation guards.
 *
 * Fail-closed: if either side is unknown (`null`), the candidate cannot be
 * ruled out, so it is treated as potentially management and callers must
 * require confirmation. Only a definitive mismatch returns `false`.
 *
 * All three network mutation routes (wifi/connect, wifi/disconnect, ip)
 * share this helper — do not reimplement the boolean inline; a previous
 * inline copy inverted the null case and silently skipped the guard.
 */
export function isPotentiallyManagementInterface(
  managementIface: string | null,
  candidate: string | null,
): boolean {
  if (managementIface === null || candidate === null) return true;
  return managementIface === candidate;
}

/* ─── Saved Wi-Fi profiles ───────────────────── */

export interface WifiProfile {
  name: string;
  uuid: string;
  /** The network the profile joins; differs from `name` for pinned `<ssid> (<iface>)` profiles. */
  ssid: string;
  /** Adapter the profile is pinned to, when it is. */
  iface?: string;
  autoconnect: boolean;
  /** Unix seconds of the last activation, 0 when never used. */
  timestamp: number;
}

/**
 * Every saved Wi-Fi profile with its real SSID. `connection show` in list
 * mode cannot print per-setting fields, so the SSID and pinned adapter come
 * from one `-g` read per profile.
 */
export async function listWifiProfiles(): Promise<WifiProfile[]> {
  const output = await nmcli([
    '-t', '-f', 'NAME,UUID,TYPE,AUTOCONNECT,TIMESTAMP',
    'connection', 'show',
  ]);

  const rows: Array<{ name: string; uuid: string; autoconnect: boolean; timestamp: number }> = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const fields = parseTerseFields(line);
    if (fields.length < 5 || fields[2] !== '802-11-wireless') continue;
    const [name, uuid, , autoconnect, timestamp] = fields;
    rows.push({ name, uuid, autoconnect: autoconnect === 'yes', timestamp: parseInt(timestamp, 10) || 0 });
  }

  return Promise.all(
    rows.map(async (row) => {
      let ssid = row.name;
      let iface: string | undefined;
      try {
        const detail = await nmcli([
          '-g', '802-11-wireless.ssid,connection.interface-name',
          'connection', 'show', row.uuid,
        ]);
        const [ssidLine = '', ifaceLine = ''] = detail.split('\n');
        const realSsid = ssidLine.replace(/\\:/g, ':').trim();
        if (realSsid) ssid = realSsid;
        const pinned = ifaceLine.trim();
        if (pinned) iface = pinned;
      } catch {
        // Fall back to the name, which is the SSID for profiles made outside Home Screens
      }
      return { ...row, ssid, ...(iface && { iface }) };
    }),
  );
}

/* ─── Active connection lookup ───────────────── */

/**
 * The device a saved connection is currently active on, or `null` when it is
 * not active. Throws when nmcli fails so callers can fail closed.
 */
export async function findActiveDevice(connectionUuid: string): Promise<string | null> {
  const output = await nmcli([
    '-t', '-f', 'UUID,DEVICE',
    'connection', 'show', '--active',
  ]);
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const fields = parseTerseFields(line);
    if (fields.length >= 2 && fields[0] === connectionUuid) return fields[1] || null;
  }
  return null;
}

/* ─── Other reachable address ────────────────── */

/**
 * An IPv4 address this device answers on through an adapter other than
 * `excludeIface`, for the warning shown before a change cuts the adapter the
 * browser is using. `null` when no other adapter holds an address.
 */
export async function getOtherReachableAddress(excludeIface: string | null): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ip', ['-4', '-o', 'addr', 'show', 'scope', 'global'], {
      timeout: NMCLI_TIMEOUT_MS,
      env: EXEC_ENV,
    });
    // Lines: "3: wlan0    inet 192.168.86.143/24 brd ... scope global ..."
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\d+:\s+(\S+)\s+inet\s+(\d{1,3}(?:\.\d{1,3}){3})\//);
      if (!match) continue;
      const [, dev, address] = match;
      if (dev === 'lo' || (excludeIface && dev === excludeIface)) continue;
      return address;
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── Source-based routing ───────────────────── */

/**
 * Routing table range reserved for per-interface source routing.
 * Tables 100–119 are used (one per connected interface, max 20).
 */
const SOURCE_ROUTE_TABLE_BASE = 100;
const SOURCE_ROUTE_TABLE_MAX = 119;

/** Serializes source-routing updates (separate from the nmcli writeMutex) */
let sourceRouteMutex: Promise<void> = Promise.resolve();

/** Snapshot of the last topology we configured, to skip no-op runs */
let lastRouteSnapshot = '';

/**
 * Ensure source-based routing for all connected interfaces.
 *
 * When multiple interfaces are active on different subnets, the kernel
 * picks one default route for all outbound traffic. Packets arriving on
 * the non-default interface get responses sent out the wrong interface.
 * This breaks SSH, HTTP, and everything else on the secondary interface.
 *
 * The fix: for each connected interface, add a policy routing rule that
 * says "packets originating from this IP use a dedicated routing table."
 *
 * Always cleans stale rules first (even when topology shrinks to 1
 * interface), then re-adds only when ≥2 interfaces are active.
 * Serialized through its own mutex to prevent races with concurrent calls.
 */
export async function ensureSourceRouting(): Promise<void> {
  const task = sourceRouteMutex.then(() => _ensureSourceRoutingImpl());
  sourceRouteMutex = task.catch(() => {});
  return task;
}

async function _ensureSourceRoutingImpl(): Promise<void> {
  try {
    const { stdout: routeOutput } = await execFileAsync('ip', ['route', 'show'], {
      timeout: NMCLI_TIMEOUT_MS,
      env: EXEC_ENV,
    });

    // Parse connected interfaces from the routing table.
    // Step 1: Find default routes (gateway + device). The `src` field is
    // optional — many systems omit it from default route lines.
    // Step 2: Get each interface's IP and subnet from kernel scope-link lines
    // which always include `src`.
    const gateways = new Map<string, string>(); // dev → gateway
    const ifaceIPs = new Map<string, { ip: string; subnet: string }>(); // dev → { ip, subnet }

    for (const line of routeOutput.split('\n')) {
      // Default route: "default via 192.168.86.1 dev wlan0 ..."
      const defaultMatch = line.match(/^default via (\S+) dev (\S+)/);
      if (defaultMatch) {
        const [, gateway, dev] = defaultMatch;
        if (!gateways.has(dev)) gateways.set(dev, gateway);
      }
      // Subnet route: "192.168.86.0/24 dev wlan0 ... src 192.168.86.187"
      const subnetMatch = line.match(/^(\S+\/\d+) dev (\S+).*src (\S+)/);
      if (subnetMatch) {
        const [, subnet, dev, ip] = subnetMatch;
        if (!ifaceIPs.has(dev)) ifaceIPs.set(dev, { ip, subnet });
      }
    }

    // Merge: only interfaces with both a default route AND a known IP
    const interfaces = new Map<string, { ip: string; gateway: string; subnet: string }>();
    for (const [dev, gateway] of gateways) {
      const ipInfo = ifaceIPs.get(dev);
      if (ipInfo) {
        interfaces.set(dev, { ip: ipInfo.ip, gateway, subnet: ipInfo.subnet });
      }
    }

    // Build a snapshot to detect topology changes — skip if unchanged
    const snapshot = [...interfaces.entries()]
      .map(([dev, info]) => `${dev}:${info.ip}:${info.gateway}:${info.subnet}`)
      .sort()
      .join('|');
    if (snapshot === lastRouteSnapshot) return;
    lastRouteSnapshot = snapshot;

    // Always clean stale rules (even when shrinking to 1 interface)
    for (let t = SOURCE_ROUTE_TABLE_BASE; t <= SOURCE_ROUTE_TABLE_MAX; t++) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await execFileAsync('sudo', ['ip', 'rule', 'del', 'table', String(t)], {
            timeout: NMCLI_TIMEOUT_MS,
          });
        } catch {
          break;
        }
      }
      await execFileAsync('sudo', ['ip', 'route', 'flush', 'table', String(t)], {
        timeout: NMCLI_TIMEOUT_MS,
      }).catch(() => {});
    }

    // Only add rules when multiple interfaces need them
    if (interfaces.size < 2) return;

    let tableNum = SOURCE_ROUTE_TABLE_BASE;
    for (const [dev, info] of interfaces) {
      if (!info.ip || !info.gateway || tableNum > SOURCE_ROUTE_TABLE_MAX) continue;

      await execFileAsync('sudo', [
        'ip', 'rule', 'add', 'from', info.ip, 'table', String(tableNum),
      ], { timeout: NMCLI_TIMEOUT_MS }).catch(() => {});

      await execFileAsync('sudo', [
        'ip', 'route', 'replace', 'default',
        'via', info.gateway, 'table', String(tableNum),
      ], { timeout: NMCLI_TIMEOUT_MS }).catch(() => {});

      await execFileAsync('sudo', [
        'ip', 'route', 'replace', info.subnet,
        'dev', dev, 'table', String(tableNum),
      ], { timeout: NMCLI_TIMEOUT_MS }).catch(() => {});

      tableNum++;
    }
  } catch (err) {
    log.error('ensureSourceRouting failed:', err);
  }
}

/* ─── Test helpers ───────────────────────────── */

/**
 * Reset module-level state for tests. Not exported from the
 * public API — only available via the __resetForTests symbol.
 */
export function __resetForTests(): void {
  if (pendingRollback) {
    clearTimeout(pendingRollback.timer);
  }
  pendingRollback = null;
  pendingRollbackStartTime = 0;
  writeMutex = Promise.resolve();
  sourceRouteMutex = Promise.resolve();
  lastRouteSnapshot = '';
}

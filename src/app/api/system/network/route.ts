import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { nmcli, getManagementInterface } from '@/lib/network-commands';
import { withAuth, getClientIP } from '@/lib/api-utils';
import { parseTerseFields } from '@/lib/network-parse';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFileCb);

/* ─── Types ─────────────────────────────────── */

interface IPv4Info {
  address: string;
  prefix: number;
  gateway: string;
  dns: string[];
  method: 'auto' | 'manual';
}

interface WifiInfo {
  ssid: string;
  signal: number;
  frequency: number;
  security: string;
}

interface NetworkInterface {
  device: string;
  type: string;
  state: string;
  connection: string;
  hwAddress: string;
  ipv4?: IPv4Info;
  wifi?: WifiInfo;
  driver?: string;
  isManagementInterface: boolean;
}

interface NetworkOverview {
  available: boolean;
  reason?: string;
  hostname?: string;
  interfaces?: NetworkInterface[];
}

/* ─── Helpers ───────────────────────────────── */

/**
 * Parse `nmcli -t device show <iface>` output into a key-value map.
 * Keys like `IP4.ADDRESS[1]` are preserved as-is.
 */
function parseDeviceShow(output: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    // First colon separates key from value, but value may contain colons
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx);
    // Unescape nmcli terse-mode escaped colons in values (e.g. MAC addresses)
    const value = line.slice(colonIdx + 1).replace(/\\:/g, ':');
    map.set(key, value);
  }

  return map;
}

/**
 * Detect the kernel driver for a network interface by reading the
 * sysfs driver symlink. Returns null on non-Linux or if the path
 * doesn't exist.
 */
async function detectDriver(device: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'readlink',
      ['-f', `/sys/class/net/${device}/device/driver`],
      { timeout: 5000 },
    );
    const driverPath = stdout.trim();
    if (!driverPath) return null;

    // Extract the last path segment: /sys/bus/usb/drivers/rtl8xxxu -> rtl8xxxu
    const segments = driverPath.split('/');
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}


/* ─── Route handler ─────────────────────────── */

export const GET = withAuth(async (request: NextRequest) => {
  // Step 1: Check nmcli availability
  try {
    await nmcli(['general', 'status']);
  } catch (err: unknown) {
    const isNotFound =
      err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';

    return NextResponse.json({
      available: false,
      reason: isNotFound
        ? 'NetworkManager not found'
        : 'NetworkManager not available',
    } satisfies NetworkOverview);
  }

  // Step 2: Get hostname
  const hostname = os.hostname();

  // Step 3: List interfaces
  let deviceOutput: string;
  try {
    deviceOutput = await nmcli(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status']);
  } catch {
    return NextResponse.json({
      available: false,
      reason: 'Failed to query device status',
    } satisfies NetworkOverview);
  }

  const interfaceEntries: { device: string; type: string; state: string; connection: string }[] = [];

  for (const line of deviceOutput.split('\n')) {
    if (!line.trim()) continue;

    const fields = parseTerseFields(line);
    if (fields.length < 4) continue;

    const [device, type, state, connection] = fields;

    // Filter out loopback
    if (type === 'loopback' || device === 'lo') continue;

    interfaceEntries.push({ device, type, state, connection });
  }

  // Step 4: Detect management interface
  const clientIP = getClientIP(request);
  const managementIface = await getManagementInterface(clientIP);

  // Step 5: Get details per interface (in parallel)
  const interfaces: NetworkInterface[] = await Promise.all(
    interfaceEntries.map(async (entry) => {
      const [showOutput, driver] = await Promise.all([
        nmcli(['-t', '-f', 'all', 'device', 'show', entry.device]).catch(() => ''),
        detectDriver(entry.device),
      ]);

      const details = parseDeviceShow(showOutput);

      // Build hw address
      const hwAddress = details.get('GENERAL.HWADDR') ?? '';

      // Build IPv4 info
      let ipv4: IPv4Info | undefined;
      const addressField = details.get('IP4.ADDRESS[1]');
      if (addressField) {
        const [addr, prefixStr] = addressField.split('/');
        const gateway = details.get('IP4.GATEWAY') ?? '';

        // Collect all DNS entries
        const dns: string[] = [];
        for (let i = 1; ; i++) {
          const dnsEntry = details.get(`IP4.DNS[${i}]`);
          if (!dnsEntry) break;
          dns.push(dnsEntry);
        }

        // Determine method from connection details
        // We need the connection name to look up the method
        let method: 'auto' | 'manual' = 'auto';
        const connectionName = entry.connection;
        if (connectionName) {
          try {
            const connOutput = await nmcli([
              '-t', '-f', 'ipv4.method',
              'connection', 'show', connectionName,
            ]);
            const methodLine = connOutput.trim();
            if (methodLine.includes('manual')) {
              method = 'manual';
            }
          } catch {
            // Fallback to auto
          }
        }

        ipv4 = {
          address: addr,
          prefix: isNaN(parseInt(prefixStr, 10)) ? 24 : parseInt(prefixStr, 10),
          gateway,
          dns,
          method,
        };
      }

      // Build wifi info (only for wifi type when connected)
      // Signal/frequency/security come from `device wifi list`, not `device show`
      let wifi: WifiInfo | undefined;
      if (entry.type === 'wifi' && entry.state === 'connected') {
        const ssid = details.get('GENERAL.CONNECTION') ?? entry.connection;
        try {
          const wifiOutput = await nmcli([
            '-t', '-f', 'SSID,SIGNAL,SECURITY,FREQ,IN-USE',
            'device', 'wifi', 'list', 'ifname', entry.device,
          ]);
          // Find the row with IN-USE=* (the connected network)
          for (const wifiLine of wifiOutput.split('\n')) {
            const wifiFields = parseTerseFields(wifiLine);
            if (wifiFields.length >= 5 && wifiFields[4] === '*') {
              wifi = {
                ssid: wifiFields[0] || ssid,
                signal: parseInt(wifiFields[1], 10) || 0,
                frequency: parseInt(wifiFields[3].replace(/[^\d]/g, ''), 10) || 0,
                security: wifiFields[2] || '',
              };
              break;
            }
          }
        } catch {
          // Fallback: just provide the SSID without signal details
          if (ssid) {
            wifi = { ssid, signal: 0, frequency: 0, security: '' };
          }
        }
      }

      const iface: NetworkInterface = {
        device: entry.device,
        type: entry.type,
        state: entry.state,
        connection: entry.connection,
        hwAddress,
        isManagementInterface: entry.device === managementIface,
      };

      if (ipv4) iface.ipv4 = ipv4;
      if (wifi) iface.wifi = wifi;
      if (driver) iface.driver = driver;

      return iface;
    }),
  );

  const overview: NetworkOverview = {
    available: true,
    hostname,
    interfaces,
  };

  return NextResponse.json(overview);
}, 'Failed to get network overview');

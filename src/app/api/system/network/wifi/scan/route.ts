import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { nmcli } from '@/lib/network-commands';
import { validateInterfaceRegex } from '@/lib/network-validation';
import { withAuth } from '@/lib/api-utils';
import { parseTerseFields } from '@/lib/network-parse';

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface WifiNetwork {
  ssid: string;
  bssid: string;
  signal: number;    // 0-100
  frequency: number; // MHz
  security: string;  // "WPA2", "WPA3", "WEP", "Open"
  inUse: boolean;    // currently connected
  saved: boolean;    // has a saved connection profile
}

/* ─── Rate-limit cache ───────────────────────── */

const lastScan = new Map<string, { time: number; results: WifiNetwork[] }>();
const SCAN_COOLDOWN_MS = 15_000;

/* ─── Route handler ─────────────────────────── */

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const iface = searchParams.get('iface') ?? '';

  // Validate interface name before using it in a command
  const ifaceValidation = validateInterfaceRegex(iface);
  if (!ifaceValidation.valid) {
    return NextResponse.json(
      { error: ifaceValidation.error ?? 'Invalid interface name' },
      { status: 400 },
    );
  }

  // Rate limit: return cached results if within cooldown window
  const cached = lastScan.get(iface);
  if (cached && Date.now() - cached.time < SCAN_COOLDOWN_MS) {
    return NextResponse.json(cached.results);
  }

  // Run WiFi scan and get saved connections in parallel
  let scanOutput: string;
  let savedOutput: string;

  try {
    [scanOutput, savedOutput] = await Promise.all([
      nmcli([
        '-t', '-f', 'SSID,BSSID,SIGNAL,SECURITY,FREQ,IN-USE',
        'device', 'wifi', 'list', 'ifname', iface,
      ]),
      nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show']),
    ]);
  } catch (err: unknown) {
    const isNotFound =
      err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';

    if (isNotFound) {
      // nmcli not available — return empty array, not an error
      return NextResponse.json([]);
    }

    // For other errors (e.g. interface not found), also return empty array
    // so the UI can show "no networks found" rather than an error state
    return NextResponse.json([]);
  }

  // Build a Set of saved WiFi SSIDs from connection list
  // nmcli connection show output: NAME:TYPE (one per line)
  const savedSsids = new Set<string>();
  for (const line of savedOutput.split('\n')) {
    if (!line.trim()) continue;
    const fields = parseTerseFields(line);
    if (fields.length >= 2 && fields[1] === '802-11-wireless') {
      savedSsids.add(fields[0]);
    }
  }

  // Parse scan results
  // nmcli output: SSID:BSSID:SIGNAL:SECURITY:FREQ:IN-USE
  // Fields: SSID, BSSID (with escaped colons), SIGNAL (0-100), SECURITY, FREQ, IN-USE (* = connected)
  const bySSID = new Map<string, WifiNetwork>();

  for (const line of scanOutput.split('\n')) {
    if (!line.trim()) continue;

    const fields = parseTerseFields(line);
    if (fields.length < 6) continue;

    const [ssid, bssid, signalStr, security, freqStr, inUseMarker] = fields;

    // Skip hidden networks (empty SSID)
    if (!ssid) continue;

    const signal = parseInt(signalStr, 10) || 0;
    const frequency = parseInt(freqStr.replace(/[^\d]/g, ''), 10) || 0;
    const inUse = inUseMarker === '*';
    const securityNormalized = security.trim() || 'Open';

    const network: WifiNetwork = {
      ssid,
      bssid,
      signal,
      frequency,
      security: securityNormalized,
      inUse,
      saved: savedSsids.has(ssid),
    };

    // Deduplicate by SSID — keep the strongest signal
    const existing = bySSID.get(ssid);
    if (!existing || signal > existing.signal) {
      bySSID.set(ssid, network);
    } else if (inUse && !existing.inUse) {
      // Always prefer the in-use entry so inUse flag is accurate
      bySSID.set(ssid, network);
    }
  }

  const results = Array.from(bySSID.values());

  // Cache results for rate limiting
  lastScan.set(iface, { time: Date.now(), results });

  return NextResponse.json(results);
}, 'Failed to scan WiFi networks');

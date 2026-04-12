import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, getClientIP } from '@/lib/api-utils';
import {
  nmcli,
  nmcliSudo,
  getManagementInterface,
  inhibitWatchdog,
  scheduleRollback,
} from '@/lib/network-commands';
import {
  validateUUID,
  validateIPv4,
  validateCIDRPrefix,
} from '@/lib/network-validation';
import { parseTerseFields } from '@/lib/network-parse';

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface IPConfigRequest {
  connectionId: string;
  method: 'auto' | 'manual';
  // Required when method=manual:
  address?: string;
  prefix?: number;
  gateway?: string;
  dns?: string[];
  confirmed?: boolean;
}

/* ─── Helpers ───────────────────────────────── */

/**
 * Capture the current IPv4 settings for a connection so we can
 * schedule a rollback if the new configuration causes a disconnection.
 */
async function captureCurrentSettings(
  connectionId: string,
): Promise<{ method: 'auto' | 'manual'; addresses?: string; gateway?: string; dns?: string }> {
  try {
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
  } catch {
    // Fallback: assume auto so rollback is safe
    return { method: 'auto' };
  }
}

/**
 * Get the device name associated with a connection ID.
 * Returns null if the connection is not active on any device.
 */
async function getDeviceForConnection(connectionId: string): Promise<string | null> {
  try {
    const output = await nmcli([
      '-t', '-f', 'DEVICE',
      'connection', 'show', connectionId,
    ]);

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const fields = parseTerseFields(line);
      // The -f DEVICE output just gives us DEVICE:<value>
      if (fields.length >= 2 && fields[0] === 'GENERAL.IP-IFACE') {
        return fields[1] || null;
      }
      // Terse single-field output (just the value)
      if (fields.length === 1 && fields[0]) {
        return fields[0];
      }
    }

    return null;
  } catch {
    return null;
  }
}

/* ─── Route handler ─────────────────────────── */

export const PUT = withAuth(async (request: NextRequest) => {
  let body: IPConfigRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { connectionId, method, address, prefix, gateway, dns, confirmed } = body;

  // 1. Validate connectionId
  const uuidResult = validateUUID(connectionId);
  if (!uuidResult.valid) {
    return NextResponse.json({ error: uuidResult.error }, { status: 400 });
  }

  // 2. Validate method
  if (method !== 'auto' && method !== 'manual') {
    return NextResponse.json(
      { error: 'method must be "auto" or "manual"' },
      { status: 400 },
    );
  }

  // 3. Validate manual-mode fields
  if (method === 'manual') {
    if (!address) {
      return NextResponse.json({ error: 'address is required for manual mode' }, { status: 400 });
    }
    const addrResult = validateIPv4(address);
    if (!addrResult.valid) {
      return NextResponse.json({ error: `address: ${addrResult.error}` }, { status: 400 });
    }

    if (prefix === undefined || prefix === null) {
      return NextResponse.json({ error: 'prefix is required for manual mode' }, { status: 400 });
    }
    const prefixResult = validateCIDRPrefix(prefix);
    if (!prefixResult.valid) {
      return NextResponse.json({ error: `prefix: ${prefixResult.error}` }, { status: 400 });
    }

    if (!gateway) {
      return NextResponse.json({ error: 'gateway is required for manual mode' }, { status: 400 });
    }
    const gatewayResult = validateIPv4(gateway);
    if (!gatewayResult.valid) {
      return NextResponse.json({ error: `gateway: ${gatewayResult.error}` }, { status: 400 });
    }

    if (dns && Array.isArray(dns)) {
      for (let i = 0; i < dns.length; i++) {
        const dnsResult = validateIPv4(dns[i]);
        if (!dnsResult.valid) {
          return NextResponse.json(
            { error: `dns[${i}]: ${dnsResult.error}` },
            { status: 400 },
          );
        }
      }
    }
  }

  // 4. Determine whether this connection is on the management interface
  const clientIP = getClientIP(request);
  const managementIface = await getManagementInterface(clientIP);

  // Get the device associated with this connection to compare
  const connectionDevice = await getDeviceForConnection(connectionId);
  const isManagement = connectionDevice !== null && connectionDevice === managementIface;

  // 5. Require confirmation for management interface changes
  if (isManagement && !confirmed) {
    return NextResponse.json({
      requiresConfirmation: true,
      warning:
        "This is the interface you're using to access this page. " +
        'Changing IP settings may temporarily disconnect you. ' +
        'An automatic rollback will occur in 60 seconds if connectivity is lost.',
    });
  }

  // 6. Capture current settings for rollback (management interface only)
  const previousSettings = isManagement
    ? await captureCurrentSettings(connectionId)
    : null;

  // 7. Inhibit watchdog before making changes
  if (isManagement) {
    await inhibitWatchdog();
  }

  // 8. Build nmcli modify args
  let modifyArgs: string[];
  if (method === 'auto') {
    modifyArgs = [
      'connection', 'modify', connectionId,
      'ipv4.method', 'auto',
      'ipv4.addresses', '',
      'ipv4.gateway', '',
      'ipv4.dns', '',
    ];
  } else {
    modifyArgs = [
      'connection', 'modify', connectionId,
      'ipv4.method', 'manual',
      'ipv4.addresses', `${address}/${prefix}`,
      'ipv4.gateway', gateway!,
      'ipv4.dns', (dns && dns.length > 0) ? dns.join(' ') : '',
    ];
  }

  // 9. Apply the configuration change
  try {
    await nmcliSudo(modifyArgs);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Failed to modify connection';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // 10. Cycle the connection to apply the new settings
  try {
    await nmcliSudo(['connection', 'down', connectionId]);
    await nmcliSudo(['connection', 'up', connectionId]);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Failed to cycle connection';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // 11. Schedule rollback for management interface changes
  let rollbackId: string | undefined;
  if (isManagement && previousSettings) {
    rollbackId = scheduleRollback(connectionId, previousSettings);
  }

  return NextResponse.json({
    ok: true,
    ...(rollbackId && { rollbackId }),
  });
}, 'Failed to update IP configuration');

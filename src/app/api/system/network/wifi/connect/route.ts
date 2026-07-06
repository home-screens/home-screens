import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { withAuth, getClientIP } from '@/lib/api-utils';
import {
  nmcliSudo,
  nmcli,
  getManagementInterface,
  inhibitWatchdog,
  uninhibitWatchdog,
  scheduleRollback,
  hasActiveRollback,
  ensureSourceRouting,
  isPotentiallyManagementInterface,
} from '@/lib/network-commands';
import {
  validateSSID,
  validateWPAPassword,
  validateInterfaceRegex,
} from '@/lib/network-validation';
import { parseTerseFields } from '@/lib/network-parse';

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface ConnectRequest {
  ssid: string;
  password?: string;
  iface: string;
  confirmed?: boolean;
}

/**
 * Tell cloud-init to keep its hands off network config. Raspberry Pi OS
 * ships cloud-init enabled with a NoCloud datasource that contains only
 * an ethernet stanza; on every boot it regenerates /etc/netplan from
 * that, deleting the 90-NM-<uuid>.yaml NetworkManager writes for the
 * Wi-Fi profile we just created. Without this drop-in, any Wi-Fi added
 * here gets silently nuked at the next reboot.
 *
 * Idempotent and non-fatal: on systems without cloud-init the tee call
 * fails and we swallow the error.
 */
async function disableCloudInitNetwork(): Promise<void> {
  try {
    const dropIn = 'network: {config: disabled}\n';
    const child = execFileCb(
      'sudo',
      ['tee', '/etc/cloud/cloud.cfg.d/99-home-screens-network.cfg'],
      (err) => {
        if (err)
          console.warn(
            '[network/wifi/connect] Failed to write cloud-init drop-in (non-fatal):',
            err.message,
          );
      },
    );
    child.stdin?.write(dropIn);
    child.stdin?.end();
    await new Promise<void>((resolve) => child.on('close', resolve));
  } catch {
    // Non-fatal: cloud-init may not be installed
  }
}

/* ─── Helpers ───────────────────────────────── */

/**
 * Capture the current connection settings for an interface so we
 * can schedule a rollback if the user loses connectivity.
 *
 * Returns null if no active connection is found on the interface.
 */
async function captureCurrentConnection(
  iface: string,
): Promise<{ connectionId: string; settings: { method: 'auto' | 'manual'; addresses?: string; gateway?: string; dns?: string } } | null> {
  try {
    // Find the active connection on this interface
    const output = await nmcli([
      '-t', '-f', 'UUID,DEVICE,TYPE',
      'connection', 'show', '--active',
    ]);

    let connectionId: string | null = null;
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const fields = parseTerseFields(line);
      if (fields.length >= 3 && fields[1] === iface && fields[2] === '802-11-wireless') {
        connectionId = fields[0];
        break;
      }
    }

    if (!connectionId) return null;

    // Read current IPv4 settings from the connection
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

    return {
      connectionId,
      settings: { method, ...(addresses && { addresses }), ...(gateway && { gateway }), ...(dns && { dns }) },
    };
  } catch {
    return null;
  }
}

/* ─── Route handler ─────────────────────────── */

export const POST = withAuth(async (request: NextRequest) => {
  let body: ConnectRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ssid, password, iface, confirmed } = body;

  // 1. Validate SSID
  const ssidResult = validateSSID(ssid);
  if (!ssidResult.valid) {
    return NextResponse.json({ error: ssidResult.error }, { status: 400 });
  }

  // 2. Validate password if provided
  if (password !== undefined && password !== null) {
    const passResult = validateWPAPassword(password);
    if (!passResult.valid) {
      return NextResponse.json({ error: passResult.error }, { status: 400 });
    }
  }

  // 3. Validate interface name
  const ifaceResult = validateInterfaceRegex(iface);
  if (!ifaceResult.valid) {
    return NextResponse.json({ error: ifaceResult.error }, { status: 400 });
  }

  // 4. Check if targeting management interface
  // Fail-closed: if we can't determine management interface, assume the target
  // could be management to avoid silently skipping safety guards
  const clientIP = getClientIP(request);
  const managementIface = await getManagementInterface(clientIP);
  const isManagement = isPotentiallyManagementInterface(managementIface, iface);

  // 5. Reject if a rollback is already in progress
  if (isManagement && hasActiveRollback()) {
    return NextResponse.json(
      { error: 'A network change is already pending confirmation. Wait for it to complete or be reverted.' },
      { status: 409 },
    );
  }

  // 6. Require confirmation for management interface changes
  if (isManagement && !confirmed) {
    return NextResponse.json({
      requiresConfirmation: true,
      warning:
        "This is the interface you're using to access this page. " +
        'Changing WiFi may temporarily disconnect you.',
    });
  }

  // 6. Capture current connection for rollback (before making changes)
  const previousConnection = isManagement
    ? await captureCurrentConnection(iface)
    : null;

  // 7. Only inhibit watchdog when we can actually schedule a rollback
  const canRollback = isManagement && previousConnection !== null;
  if (canRollback) {
    await inhibitWatchdog();
  }

  // 8. Build nmcli args — omit password args for open networks
  const args = ['device', 'wifi', 'connect', ssid];
  if (password) {
    args.push('password', password);
  }
  args.push('ifname', iface);

  // 9. Execute connection
  try {
    const stdout = await nmcliSudo(args);

    // 10. Ensure source-based routing so both interfaces remain reachable
    await ensureSourceRouting();

    // 10b. Self-heal cloud-init on already-installed Pis so the profile
    // we just wrote survives the next reboot. See helper for full context.
    await disableCloudInitNetwork();

    // 11. Schedule rollback if management interface with prior connection
    let rollbackId: string | undefined;
    if (canRollback) {
      rollbackId = scheduleRollback(
        previousConnection!.connectionId,
        previousConnection!.settings,
      );
    }

    return NextResponse.json({
      ok: true,
      connection: stdout.trim(),
      ...(rollbackId && { rollbackId }),
    });
  } catch (err: unknown) {
    if (canRollback) await uninhibitWatchdog();
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Connection failed';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, 'Failed to connect to WiFi network');

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { withAuth, getClientIP, getLocalIP, parseJsonBody, execErrorMessage } from '@/lib/api-utils';
import { requireSudo } from '@/lib/sudo-grant';
import {
  nmcliSudo,
  nmcli,
  getManagementInterface,
  getOtherReachableAddress,
  inhibitWatchdog,
  uninhibitWatchdog,
  scheduleRollback,
  hasActiveRollback,
  ensureSourceRouting,
  isPotentiallyManagementInterface,
  listWifiProfiles,
  readConnectionIpv4Settings,
  type Ipv4Settings,
} from '@/lib/network-commands';
import {
  validateSSID,
  validateWPAPassword,
  validateInterfaceRegex,
} from '@/lib/network-validation';
import { parseTerseFields } from '@/lib/network-parse';
import {
  buildAddProfileArgs,
  buildModifyProfileArgs,
  buildUpArgs,
  describeJoinFailure,
  isOwnProfile,
  isPredecessorProfile,
  isSecuredNetwork,
  parseAddedConnectionUuid,
  WIFI_UP_WAIT_SECONDS,
} from '@/lib/wifi-profile';
import { logger } from '@/lib/logger';

const log = logger('network/wifi/connect');

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface ConnectRequest {
  ssid: string;
  password?: string;
  iface: string;
  confirmed?: boolean;
  /** The scan's SECURITY column for the chosen network ("WPA2", "WPA3", "Open"). */
  security?: string;
  /** The network does not broadcast its name (typed in by hand). */
  hidden?: boolean;
}

/** Room past nmcli's own wait so the exec timeout never beats `--wait`. */
const UP_TIMEOUT_MS = (WIFI_UP_WAIT_SECONDS + 10) * 1000;

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
          log.warn(
            'Failed to write cloud-init drop-in (non-fatal):',
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
): Promise<{ connectionId: string; settings: Ipv4Settings } | null> {
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

    const settings = await readConnectionIpv4Settings(connectionId);
    return { connectionId, settings };
  } catch {
    return null;
  }
}

/**
 * Create or update the Home Screens profile for this network on this adapter
 * and return its UUID. Never `nmcli device wifi connect`: that reuses whatever
 * saved profile matches the SSID and, on nmcli 1.50 to 1.54.3, rebuilds its
 * security setting without `key-mgmt`, so every rejoin of a known network
 * fails. One pinned profile per network per adapter sidesteps the reuse.
 */
async function ensureProfile(spec: {
  ssid: string;
  iface: string;
  password?: string;
  security?: string;
  hidden?: boolean;
}): Promise<string> {
  const profiles = await listWifiProfiles();
  const own = profiles.find((p) => isOwnProfile(p, spec.ssid, spec.iface));
  // A secured network rejoined without a password keeps the saved one
  const keepSecurity = !spec.password && isSecuredNetwork(spec.security);

  if (own) {
    for (const args of buildModifyProfileArgs(own.uuid, spec, { keepSecurity })) {
      await nmcliSudo(args);
    }
    return own.uuid;
  }

  if (keepSecurity) {
    throw new PasswordRequiredError();
  }

  // Carry a static address over from the profile this one takes over from,
  // so a Pi someone reaches at a fixed address stays there.
  const predecessor = profiles.find((p) => isPredecessorProfile(p, spec.ssid, spec.iface));
  let inheritIpv4: Ipv4Settings | null = null;
  if (predecessor) {
    try {
      inheritIpv4 = await readConnectionIpv4Settings(predecessor.uuid);
    } catch {
      // Unreadable: the new profile gets DHCP, which is also what it had if this failed
    }
  }

  const stdout = await nmcliSudo(buildAddProfileArgs(spec, inheritIpv4));
  const uuid = parseAddedConnectionUuid(stdout);
  if (!uuid) {
    throw new Error(`nmcli did not report the new profile's id: ${stdout.trim()}`);
  }
  return uuid;
}

/** A secured network with no password typed and no saved one to fall back on. */
class PasswordRequiredError extends Error {
  constructor() {
    super('This network needs a password.');
  }
}

/* ─── Route handler ─────────────────────────── */

export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<ConnectRequest>(request);
  if (body instanceof NextResponse) return body;

  const { ssid, password, iface, confirmed, security, hidden } = body;

  // 1. Validate SSID
  const ssidResult = validateSSID(ssid);
  if (!ssidResult.valid) {
    return NextResponse.json({ error: ssidResult.error }, { status: 400 });
  }

  const sudo = await requireSudo();
  if (sudo) return sudo;

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

  // 3b. The security hint is only ever matched against a few keywords, but
  // it goes nowhere near a command line, so a short string is all we ask.
  if (security !== undefined && (typeof security !== 'string' || security.length > 64)) {
    return NextResponse.json({ error: 'Invalid security type' }, { status: 400 });
  }

  // 4. Check if targeting management interface
  // Fail-closed: if we can't determine management interface, assume the target
  // could be management to avoid silently skipping safety guards
  const clientIP = getClientIP(request);
  const managementIface = await getManagementInterface(clientIP, getLocalIP(request));
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
    const otherAddress = await getOtherReachableAddress(managementIface);
    return NextResponse.json({
      requiresConfirmation: true,
      warningKind: 'connect',
      ...(otherAddress && { otherAddress }),
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

  // 8. Create or refresh our pinned profile, then bring it up by UUID
  try {
    const uuid = await ensureProfile({
      ssid,
      iface,
      password: password || undefined,
      security,
      hidden: hidden === true,
    });
    const stdout = await nmcliSudo(buildUpArgs(uuid), { timeoutMs: UP_TIMEOUT_MS });

    // 9. Ensure source-based routing so both interfaces remain reachable
    await ensureSourceRouting();

    // 9b. Self-heal cloud-init on already-installed Pis so the profile
    // we just wrote survives the next reboot. See helper for full context.
    await disableCloudInitNetwork();

    // 10. Schedule rollback if management interface with prior connection
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
      profileId: uuid,
      ...(rollbackId && { rollbackId }),
    });
  } catch (err: unknown) {
    if (canRollback) await uninhibitWatchdog();
    if (err instanceof PasswordRequiredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    const raw = execErrorMessage(err, 'Connection failed');
    log.warn('join failed:', raw);
    return NextResponse.json(
      { ok: false, error: describeJoinFailure(raw), detail: raw },
      { status: 500 },
    );
  }
}, 'Failed to connect to WiFi network');

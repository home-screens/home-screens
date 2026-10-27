import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, getClientIP, getLocalIP, parseJsonBody, execErrorMessage } from '@/lib/api-utils';
import { requireSudo } from '@/lib/sudo-grant';
import {
  nmcliSudo,
  listWifiProfiles,
  findActiveDevice,
  getManagementInterface,
  getOtherReachableAddress,
  isPotentiallyManagementInterface,
} from '@/lib/network-commands';
import { validateUUID } from '@/lib/network-validation';
import { isAuthEnabled } from '@/lib/auth';
import type { SavedNetwork } from '@/lib/network-types';

export const dynamic = 'force-dynamic';

/* ─── GET: List saved WiFi connections ──────── */

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const showPasswords = searchParams.get('showPasswords') === 'true';

  let profiles;
  try {
    profiles = await listWifiProfiles();
  } catch {
    return NextResponse.json([]);
  }

  const savedNetworks: SavedNetwork[] = profiles.map((p) => ({
    id: p.uuid,
    name: p.name,
    ssid: p.ssid,
    ...(p.iface && { iface: p.iface }),
    autoconnect: p.autoconnect,
    // TIMESTAMP is a Unix epoch (seconds) for last-used time
    lastUsed: p.timestamp > 0 ? new Date(p.timestamp * 1000).toISOString() : 'never',
  }));

  // Optionally retrieve passwords — only when auth is configured
  if (showPasswords) {
    const authEnabled = await isAuthEnabled();
    if (authEnabled) {
      // Fetch passwords in parallel (read-only via -s flag for secrets)
      await Promise.all(
        savedNetworks.map(async (network) => {
          try {
            // Reading secrets requires sudo — non-root users get an empty value
            const pskOutput = await nmcliSudo([
              '-s', '-t', '-f', '802-11-wireless-security.psk',
              'connection', 'show', network.id,
            ]);
            const pskLine = pskOutput.trim();
            const colonIdx = pskLine.indexOf(':');
            if (colonIdx !== -1) {
              const psk = pskLine.slice(colonIdx + 1).trim();
              if (psk) {
                network.password = psk;
              }
            }
          } catch {
            // Password not available — omit the field
          }
        }),
      );
    }
  }

  return NextResponse.json(savedNetworks);
}, 'Failed to list saved WiFi networks');

/* ─── DELETE: Forget a saved connection ──────── */

interface ForgetRequest {
  connectionId: string;
  confirmed?: boolean;
}

export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<ForgetRequest>(request);
  if (body instanceof NextResponse) return body;

  const { connectionId, confirmed } = body;

  // 1. Validate connection UUID
  const uuidResult = validateUUID(connectionId);
  if (!uuidResult.valid) {
    return NextResponse.json({ error: uuidResult.error }, { status: 400 });
  }

  const sudo = await requireSudo();
  if (sudo) return sudo;

  // 2. Forgetting the profile the browser is coming in over drops that
  // connection, and the response with it: the button sat on "Removing..."
  // forever. Ask first, the same way Disconnect does, and say where the
  // device will still answer.
  if (!confirmed) {
    let activeDevice: string | null = null;
    let lookupFailed = false;
    try {
      activeDevice = await findActiveDevice(connectionId);
    } catch {
      lookupFailed = true;
    }

    if (lookupFailed) {
      return NextResponse.json({
        requiresConfirmation: true,
        warningKind: 'unknown',
        warning:
          'Unable to determine if this network serves your current session. ' +
          'Forgetting it may make this device unreachable.',
      });
    }

    if (activeDevice) {
      const managementIface = await getManagementInterface(getClientIP(request), getLocalIP(request));
      if (isPotentiallyManagementInterface(managementIface, activeDevice)) {
        const otherAddress = await getOtherReachableAddress(activeDevice);
        return NextResponse.json({
          requiresConfirmation: true,
          warningKind: 'forget',
          ...(otherAddress && { otherAddress }),
          warning:
            "This is the network you're using to access this page. " +
            'Forgetting it will disconnect this device from it.',
        });
      }
    }
  }

  // 3. Delete the saved connection
  try {
    await nmcliSudo(['connection', 'delete', connectionId]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: execErrorMessage(err, 'Failed to delete connection') },
      { status: 500 },
    );
  }
}, 'Failed to manage saved WiFi networks');

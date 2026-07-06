import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, getClientIP } from '@/lib/api-utils';
import {
  nmcli,
  nmcliSudo,
  getManagementInterface,
  isPotentiallyManagementInterface,
} from '@/lib/network-commands';
import { validateUUID } from '@/lib/network-validation';
import { parseTerseFields } from '@/lib/network-parse';

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface DisconnectRequest {
  connectionId: string;
  confirmed?: boolean;
}

/* ─── Route handler ─────────────────────────── */

export const POST = withAuth(async (request: NextRequest) => {
  let body: DisconnectRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { connectionId, confirmed } = body;

  // 1. Validate connection UUID
  const uuidResult = validateUUID(connectionId);
  if (!uuidResult.valid) {
    return NextResponse.json({ error: uuidResult.error }, { status: 400 });
  }

  // 2. Look up which device this connection is active on
  let activeDevice: string | null = null;
  try {
    const output = await nmcli([
      '-t', '-f', 'UUID,DEVICE,STATE',
      'connection', 'show', '--active',
    ]);

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const fields = parseTerseFields(line);
      if (fields.length >= 3 && fields[0] === connectionId) {
        activeDevice = fields[1];
        break;
      }
    }
  } catch {
    // Could not look up active connections — fail-closed: require confirmation
    // since we can't determine if this is the management interface
    if (!confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        warning:
          'Unable to determine if this connection serves your current session. ' +
          'Disconnecting may make this device unreachable.',
      });
    }
  }

  // 3. Check if disconnecting the management interface
  if (activeDevice) {
    const clientIP = getClientIP(request);
    const managementIface = await getManagementInterface(clientIP);
    // Fail-closed: if management detection fails, assume worst case
    const isManagement = isPotentiallyManagementInterface(managementIface, activeDevice);

    if (isManagement && !confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        warning:
          "This is the interface you're using to access this page. " +
          'Disconnecting may make this device unreachable.',
      });
    }
  }

  // 4. Execute disconnect
  try {
    await nmcliSudo(['connection', 'down', connectionId]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Disconnect failed';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, 'Failed to disconnect WiFi network');

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { nmcli, nmcliSudo } from '@/lib/network-commands';
import { validateUUID } from '@/lib/network-validation';
import { parseTerseFields } from '@/lib/network-parse';
import { isAuthEnabled } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* ─── Types ─────────────────────────────────── */

interface SavedNetwork {
  id: string;
  name: string;
  ssid: string;
  autoconnect: boolean;
  lastUsed: string;
  password?: string;
}

/* ─── GET: List saved WiFi connections ──────── */

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const showPasswords = searchParams.get('showPasswords') === 'true';

  // List all connections with relevant fields
  // TIMESTAMP is a Unix epoch (seconds) for last-used time
  let output: string;
  try {
    output = await nmcli([
      '-t', '-f', 'NAME,UUID,TYPE,AUTOCONNECT,TIMESTAMP',
      'connection', 'show',
    ]);
  } catch {
    return NextResponse.json([]);
  }

  const savedNetworks: SavedNetwork[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const fields = parseTerseFields(line);
    if (fields.length < 5) continue;

    const [name, uuid, type, autoconnect, timestamp] = fields;

    // Filter to WiFi connections only
    if (type !== '802-11-wireless') continue;

    const epochSec = parseInt(timestamp, 10);
    const lastUsed =
      epochSec > 0
        ? new Date(epochSec * 1000).toISOString()
        : 'never';

    savedNetworks.push({
      id: uuid,
      name,
      ssid: name, // Connection name typically matches SSID
      autoconnect: autoconnect === 'yes',
      lastUsed,
    });
  }

  // Optionally retrieve passwords — only when auth is configured
  if (showPasswords) {
    const authEnabled = await isAuthEnabled();
    if (authEnabled) {
      // Fetch passwords in parallel (read-only via -s flag for secrets)
      await Promise.all(
        savedNetworks.map(async (network) => {
          try {
            const pskOutput = await nmcli([
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

export const DELETE = withAuth(async (request: NextRequest) => {
  let body: { connectionId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { connectionId } = body;

  // 1. Validate connection UUID
  const uuidResult = validateUUID(connectionId);
  if (!uuidResult.valid) {
    return NextResponse.json({ error: uuidResult.error }, { status: 400 });
  }

  // 2. Delete the saved connection
  try {
    await nmcliSudo(['connection', 'delete', connectionId]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Failed to delete connection';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, 'Failed to manage saved WiFi networks');

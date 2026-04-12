import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { withAuth } from '@/lib/api-utils';
import { validateHostname } from '@/lib/network-validation';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFileCb);

/* ─── Route handler ─────────────────────────── */

export const PUT = withAuth(async (request: NextRequest) => {
  let body: { hostname: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { hostname } = body;

  // 1. Validate hostname
  const hostnameResult = validateHostname(hostname);
  if (!hostnameResult.valid) {
    return NextResponse.json({ error: hostnameResult.error }, { status: 400 });
  }

  // 2. Set the hostname via hostnamectl
  try {
    await execFileAsync('sudo', ['hostnamectl', 'set-hostname', hostname]);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Failed to set hostname';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // 3. Restart avahi-daemon for mDNS propagation
  try {
    await execFileAsync('sudo', ['systemctl', 'restart', 'avahi-daemon']);
  } catch (err: unknown) {
    // Non-fatal: avahi may not be installed; hostname change still succeeded
    const message =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : 'Unknown error';
    console.warn('[network/hostname] avahi-daemon restart failed (non-fatal):', message);
  }

  return NextResponse.json({ ok: true, hostname });
}, 'Failed to update hostname');
